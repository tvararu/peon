import { type CombatEvent, itemKind } from "@tuicraft/core";
import { pause } from "@tuicraft/core/lib/abort";
import { messageOf } from "@tuicraft/core/lib/errors";
import type { LootLine, RestAfter } from "#harness/contract/details";
import type { ToolResult, ToolStatus } from "#harness/contract/result";
import type { RunControl, RunEnd, RunStatus } from "#harness/contract/runs";
import type { OpsCtx, ToolCtx, ViewCtx } from "#harness/contract/services";
import {
  dangerView,
  type InterruptCause,
  watchInterrupts,
} from "#harness/ops/danger";
import { guidHex } from "#harness/ops/refs";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import {
  manaText,
  poseView,
  selfView,
  unitViews,
  vitalsView,
} from "#harness/ops/views";
import { awaitRun, YIELD_AFTER_MS } from "#harness/runs/wait";
import {
  defineGameTool,
  type GameToolSpec,
  result,
} from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";
import { type RestArgs, restParams } from "#harness/tools/params";

type Report = ToolResult<RestAfter>;
type Consumable = {
  bag: number;
  slot: number;
  entry: number;
  name: string;
  quality: number | null;
  spellIds: number[];
};
type Levels = { hp: number; mana: number | undefined };
type Rested = {
  used: LootLine[];
  waitedMs: number;
  auraConfirmed: boolean;
  startLevels: Levels;
  stalled: boolean;
  confirmed: Set<number>;
};

const DEFAULT_UNTIL = 90;
export const REST_MAX_MS = YIELD_AFTER_MS - 10_000;
const STALL_MS = 10_000;
const POLL_MS = 1000;
const AURA_MS = 3000;
const BAG_REGIONS = new Set(["backpack", "bag_item"]);
const HUMAN_WROTE = "The human wrote a message. Read it before you act.";
const RUN_STATUS: Record<ToolStatus, Exclude<RunStatus, "running">> = {
  DONE: "succeeded",
  FAILED: "failed",
  PARTLY: "partly",
  REFUSED: "failed",
  RUNNING: "succeeded",
  UNCONFIRMED: "failed",
};

function pct(value: number, max: number): number {
  return max > 0 ? Math.round((value / max) * 100) : 100;
}

function levelsOf(ctx: ViewCtx): Levels {
  const vitals = vitalsView(ctx);
  return {
    hp: pct(vitals.hp, vitals.maxHp),
    mana:
      vitals.powerKind === "mana"
        ? pct(vitals.power, vitals.maxPower)
        : undefined,
  };
}

function reached(levels: Levels, until: number): boolean {
  return (
    levels.hp >= until && (levels.mana === undefined || levels.mana >= until)
  );
}

function vitalsText(ctx: ViewCtx): string {
  const vitals = vitalsView(ctx);
  const mana = manaText(vitals);
  return `HP ${vitals.hp}/${vitals.maxHp}${mana ? `, ${mana}` : ""}`;
}

function hpText(ctx: ViewCtx): string {
  const vitals = vitalsView(ctx);
  return `HP ${vitals.hp}/${vitals.maxHp}`;
}

function youLine(ctx: ViewCtx): string {
  const pose = poseView(ctx);
  return `You: ${vitalsText(ctx)}${pose ? `, at ${Math.round(pose.x)}, ${Math.round(pose.y)}` : ""}.`;
}

function consumables(ctx: ViewCtx): Consumable[] {
  const found = new Map<number, Consumable>();
  for (const slot of ctx.handle.getInventoryState().slots) {
    if (slot.status !== "occupied" || !BAG_REGIONS.has(slot.region)) continue;
    const { item } = slot;
    if (
      item.entry === undefined ||
      found.has(item.entry) ||
      itemKind(item) !== "food_drink"
    )
      continue;
    found.set(item.entry, {
      bag: slot.bag,
      entry: item.entry,
      name: item.name ?? `item ${item.entry}`,
      quality: item.quality,
      slot: slot.slot,
      spellIds: item.useSpellIds ?? [],
    });
  }
  return [...found.values()];
}

function itemsLeft(ctx: ViewCtx): number {
  return ctx.handle
    .getInventoryState()
    .slots.reduce(
      (sum, slot) =>
        slot.status === "occupied" &&
        BAG_REGIONS.has(slot.region) &&
        itemKind(slot.item) === "food_drink"
          ? sum + (slot.item.count ?? 1)
          : sum,
      0,
    );
}

async function useOne(ops: OpsCtx, item: Consumable): Promise<boolean> {
  try {
    const aura = await settle<CombatEvent>({
      match: (event) =>
        event.type === "aura" &&
        event.state.auras.some((known) =>
          item.spellIds.includes(known.spellId),
        ),
      send: async () => {
        await ops.rt.mutex.run(() => ops.handle.useItem(item.bag, item.slot));
      },
      signal: ops.signal,
      subscribe: (cb) => ops.handle.onCombatEvent(cb),
      timeoutMs: AURA_MS,
    });
    return aura !== undefined;
  } catch (error) {
    if (ops.signal.aborted) throw error;
    return false;
  }
}

function eating(ctx: ViewCtx, item: Consumable): boolean {
  return ctx.handle
    .getCombatState()
    .auras.some((aura) => item.spellIds.includes(aura.spellId));
}

function noteUsed(rested: Rested, item: Consumable): void {
  const same = rested.used.find((line) => line.itemId === item.entry);
  if (same) {
    same.count += 1;
    return;
  }
  rested.used.push({
    count: 1,
    itemId: item.entry,
    name: item.name,
    quality: item.quality,
  });
}

async function eat(
  ops: OpsCtx,
  init: { until: number; rested: Rested; again: boolean },
): Promise<void> {
  const { until, rested, again } = init;
  for (const item of consumables(ops)) {
    if (reached(levelsOf(ops), until)) break;
    if (eating(ops, item) || (again && !rested.confirmed.has(item.entry)))
      continue;
    const confirmed = await useOne(ops, item);
    noteUsed(rested, item);
    if (confirmed) rested.confirmed.add(item.entry);
    rested.auraConfirmed ||= confirmed;
  }
}

function rose(now: Levels, best: Levels): boolean {
  return now.hp > best.hp || (now.mana ?? 0) > (best.mana ?? 0);
}

async function rest(ops: OpsCtx, until: number, rested: Rested): Promise<void> {
  await eat(ops, { again: false, rested, until });
  let best = levelsOf(ops);
  let stillMs = 0;
  while (!reached(levelsOf(ops), until) && rested.waitedMs < REST_MAX_MS) {
    await pause(POLL_MS, ops.signal);
    rested.waitedMs += POLL_MS;
    const now = levelsOf(ops);
    stillMs = rose(now, best) ? 0 : stillMs + POLL_MS;
    if (rose(now, best)) best = now;
    if (rested.confirmed.size > 0)
      await eat(ops, { again: true, rested, until });
    if (stillMs >= STALL_MS) {
      rested.stalled = true;
      return;
    }
  }
}

function afterOf(ctx: ViewCtx, rested: Rested): RestAfter {
  const levels = levelsOf(ctx);
  return {
    auraConfirmed: rested.auraConfirmed,
    durationMs: rested.waitedMs,
    hpPct: levels.hp,
    idle: rested.used.length === 0,
    itemsLeft: itemsLeft(ctx),
    manaPct: levels.mana,
    used: rested.used,
  };
}

function projection(rested: Rested, now: Levels, until: number): string {
  const start = rested.startLevels;
  const stats = [
    { from: start.hp, level: now.hp },
    ...(now.mana === undefined ? [] : [{ from: start.mana, level: now.mana }]),
  ];
  const short = stats
    .filter((stat) => stat.level < until)
    .map((stat) => ({ gain: stat.level - (stat.from ?? stat.level), ...stat }));
  if (short.some((stat) => stat.gain <= 0))
    return ` Another rest() will not reach ${until}% without food or drink.`;
  const low = Math.min(...short.map((stat) => stat.level + stat.gain));
  if (low >= until) return ` Another rest() reaches ${until}%.`;
  return ` Another rest() reaches about ${low}%.`;
}

function doneReport(ctx: ViewCtx, rested: Rested, until: number): Report {
  const after = afterOf(ctx, rested);
  const secs = Math.round(rested.waitedMs / 1000);
  const how = after.idle
    ? "without food or drink"
    : `with ${rested.used.map((item) => item.name).join(" and ")}`;
  const left = after.idle ? "" : ` ${after.itemsLeft} food and drink left.`;
  const capped =
    rested.waitedMs >= REST_MAX_MS ? " (the limit for one rest)" : "";
  const detail = `rested ${secs} s${capped} ${how}: ${vitalsText(ctx)}.${left}`;
  if (reached(levelsOf(ctx), until)) return result("DONE", { after, detail });
  const hint = after.idle ? projection(rested, levelsOf(ctx), until) : "";
  if (rested.stalled)
    return result("PARTLY", {
      after,
      detail: `${detail} Nothing rose for ${STALL_MS / 1000} s.${hint}`,
      next: nextCall("look"),
      reason: "no_regen",
    });
  return result("PARTLY", {
    after,
    detail: `${detail}${hint}`,
    next: nextCall("rest"),
    reason: "time_limit",
  });
}

function attackerName(ctx: ViewCtx, guid: bigint): string {
  const ref = ctx.rt.refs.refOf(guid);
  const unit = unitViews(ctx).find((view) => view.guid === guidHex(guid));
  return `${unit?.name ?? ctx.rt.sightings.get(guid)?.name ?? "something"} (${ref})`;
}

function stoppedReport(init: {
  ctx: ViewCtx;
  signal: AbortSignal;
  cause: InterruptCause | undefined;
  after: RestAfter;
}): Report {
  const { ctx, signal, cause, after } = init;
  if (cause?.code === "died")
    return result("FAILED", {
      after,
      detail: "you died while resting.",
      next: nextCall("recover"),
      reason: "died",
    });
  if (cause?.attacker !== undefined)
    return result("FAILED", {
      after,
      detail: `${attackerName(ctx, cause.attacker)} hit you while resting (${hpText(ctx)}).`,
      next: nextCall("engage", { target: ctx.rt.refs.refOf(cause.attacker) }),
      reason: "interrupted",
    });
  const code = messageOf(signal.reason, "cancelled");
  if (code === "human_stop" || code === "esc")
    return result("FAILED", {
      after,
      detail: "the human stopped you. Start nothing new.",
      next: "end your turn and wait for the human.",
      reason: "cancelled",
    });
  return result("FAILED", {
    after,
    detail: `the rest was stopped (${code}).`,
    next: nextCall("look"),
    reason: "cancelled",
  });
}

function runEnd(value: Report, stop?: string): RunEnd<Report> {
  const status = stop === undefined ? RUN_STATUS[value.status] : "cancelled";
  return {
    reason: stop ?? value.reason,
    status:
      value.reason === "interrupted" || value.reason === "died"
        ? "interrupted"
        : status,
    summary: `${value.status} ${value.detail}`,
    value,
  };
}

async function launch(init: {
  ctx: ToolCtx<RestAfter>;
  until: number;
  control: RunControl;
  rested: Rested;
}): Promise<RunEnd<Report>> {
  const { ctx, until, control, rested } = init;
  const watch = watchInterrupts(
    { ...ctx, progress: control.progress, signal: control.signal },
    { death: true, newAttacker: true, rooted: false },
  );
  const ops: OpsCtx = {
    ...ctx,
    progress: control.progress,
    signal: AbortSignal.any([control.signal, watch.signal]),
  };
  try {
    await rest(ops, until, rested);
    return runEnd(doneReport(ops, rested, until));
  } catch (error) {
    if (!ops.signal.aborted) throw error;
    const stop = control.signal.aborted
      ? messageOf(control.signal.reason)
      : undefined;
    return runEnd(
      stoppedReport({
        after: afterOf(ops, rested),
        cause: watch.cause(),
        ctx: ops,
        signal: ops.signal,
      }),
      stop,
    );
  } finally {
    watch.dispose();
  }
}

function precheck(ctx: ToolCtx<RestAfter>, until: number): Report | undefined {
  const self = selfView(ctx);
  if (self.life !== "alive")
    throw new Refusal({
      detail: "you are dead; rest after you recover.",
      next: nextCall("recover"),
      reason: "dead",
    });
  const [attacker] = dangerView(ctx).attackers;
  if (attacker)
    throw new Refusal({
      detail: `${attacker.name} (${attacker.ref}) is attacking you; you cannot rest in combat.`,
      next: nextCall("engage", { target: attacker.ref }),
      reason: "in_combat",
    });
  const levels = levelsOf(ctx);
  if (!reached(levels, until)) return;
  const rested: Rested = {
    auraConfirmed: false,
    confirmed: new Set(),
    stalled: false,
    startLevels: levels,
    used: [],
    waitedMs: 0,
  };
  return result("DONE", {
    after: afterOf(ctx, rested),
    detail: `no rest needed: ${vitalsText(ctx)}.`,
  });
}

function emptyRest(): RestAfter {
  return {
    auraConfirmed: false,
    durationMs: 0,
    hpPct: 0,
    idle: true,
    itemsLeft: 0,
    manaPct: undefined,
    used: [],
  };
}

async function runRest(
  args: RestArgs,
  ctx: ToolCtx<RestAfter>,
): Promise<Report> {
  const until = args.until ?? DEFAULT_UNTIL;
  const ready = precheck(ctx, until);
  if (ready) return ready;
  const rested: Rested = {
    auraConfirmed: false,
    confirmed: new Set(),
    stalled: false,
    startLevels: levelsOf(ctx),
    used: [],
    waitedMs: 0,
  };
  const run = ctx.rt.runs.start<Report>({
    args,
    kind: "rest",
    launch: (control) => launch({ control, ctx, rested, until }),
    toolCallId: ctx.toolCallId,
  });
  const waited = await awaitRun({ rt: ctx.rt, run });
  if (waited.kind === "ended") return { ...waited.end.value, runId: run.id };
  return result("RUNNING", {
    after: afterOf(ctx, rested),
    body: waited.why === "human" ? [HUMAN_WROTE] : [],
    detail: `resting, ${Math.round(rested.waitedMs / 1000)} s so far. ${youLine(ctx)}`,
    next: `end your turn; a [game] message comes when ${run.id} ends. Or ${nextCall("stop", { run: run.id })}.`,
    runId: run.id,
  });
}

export const restSpec: GameToolSpec<typeof restParams, "rest"> = {
  fallback: emptyRest,
  kind: "run",
  name: "rest",
  parameters: restParams,
  run: runRest,
};

export const restTool = defineGameTool(restSpec);
