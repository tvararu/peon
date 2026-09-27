import { type CycleState, DEFAULT_FIGHT_INSTRUCTION } from "@tuicraft/core";
import type { EngageAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { ViewCtx } from "#harness/contract/services";
import type { UnitView } from "#harness/contract/views";
import { dangerView } from "#harness/ops/danger";
import { ITEM_NAME_WAIT_MS, nameLootLines } from "#harness/ops/item-names";
import { lootCorpseOp } from "#harness/ops/loot";
import { ENGAGE_APPROACH_YD } from "#harness/ops/range";
import { guidHex } from "#harness/ops/refs";
import { travelLeg } from "#harness/ops/travel-leg";
import {
  structuralAsk,
  structuralReach,
  type Unreached,
} from "#harness/ops/unreached";
import { poseView, unitViews, vitalsView } from "#harness/ops/views";
import {
  awaitCycle,
  awaitQuestCycle,
  awaitTactics,
  type CycleEnd,
  jevCode,
} from "#harness/runs/adapters";
import { result } from "#harness/tools/define";
import { type FightInit, MIN_HP_PCT } from "#harness/tools/engage-choose";
import {
  failText,
  noXpText,
  type StopInit,
  stopText,
} from "#harness/tools/engage-reasons";
import {
  afterOf,
  isKill,
  killNames,
  kills,
  killXp,
  nameOf,
  newTally,
  noteCycle,
  type Tally,
  watchTally,
} from "#harness/tools/engage-tally";
import { askHuman, nextCall } from "#harness/tools/next-call";

type Report = ToolResult<EngageAfter>;
type ModeEnd = {
  blocked: boolean;
  error: string | undefined;
  jev: string | undefined;
  stopCause: string | undefined;
};
type Scene = FightInit & { tally: Tally; how: string };

const APPROACH_WITHIN_YD = 25;
const TOP_UPS = 3;
const MISSING_KEY = "missing_jev_key";
const JEV_UNAVAILABLE = "jev_unavailable";
const NO_ATTACK = "no_supported_combat_actions";

function instruction(scene: Scene): string {
  return scene.args.how ?? DEFAULT_FIGHT_INSTRUCTION;
}

function otherInView(scene: Scene): UnitView | undefined {
  const { choice, ops, tally } = scene;
  const fought = new Set(tally.targets.map((target) => target.ref));
  return unitViews(ops).find(
    (unit) =>
      unit.alive &&
      !unit.tappedByOther &&
      unit.name === choice.unit?.name &&
      unit.ref !== choice.unit?.ref &&
      !fought.has(unit.ref),
  );
}

function unreachedNext(scene: Scene, leg: Unreached): string {
  if (leg.reason === "start_off_mesh")
    return nextCall("travel", { to: "unstick" });
  const kind = structuralReach(leg);
  const name = scene.choice.unit?.name ?? "the target";
  if (kind === "unsupported_map") return structuralAsk(kind, name);
  const other = otherInView(scene);
  if (other) return nextCall("engage", { target: other.ref });
  return askHuman(`I cannot reach ${name} from here. Is there another way?`);
}

async function approach(scene: Scene): Promise<Report | undefined> {
  const { choice, ops } = scene;
  if (
    !choice.unit ||
    choice.guid === undefined ||
    (choice.unit.distance ?? 0) <= ENGAGE_APPROACH_YD
  )
    return;
  const leg = await travelLeg(ops, {
    goal: { guid: choice.guid, kind: "unit", name: choice.unit.name },
    within: APPROACH_WITHIN_YD,
  });
  if (leg.status === "arrived") return;
  const reason = leg.reason ?? leg.status;
  return result("FAILED", {
    after: afterOf(ops, scene),
    detail: `could not reach ${choice.unit.name} ${choice.unit.ref}: ${leg.detail}.`,
    next: unreachedNext(scene, { detail: leg.detail, reason }),
    reason,
  });
}

function unobserved(scene: Scene): Report | undefined {
  const { choice, ops } = scene;
  if (choice.mode === "quest" || !choice.unit || choice.guid === undefined)
    return;
  const hex = guidHex(choice.guid);
  if (unitViews(ops).some((unit) => unit.guid === hex && unit.alive)) return;
  const other = otherInView(scene);
  return result("FAILED", {
    after: afterOf(ops, scene),
    detail: `${choice.unit.name} ${choice.unit.ref} is not in view any more; the fight did not start.`,
    next: other
      ? nextCall("engage", { target: other.ref })
      : nextCall("travel", { to: "explore" }),
    reason: "target_not_observed",
  });
}

async function single(scene: Scene): Promise<ModeEnd> {
  const { choice, ops, tally } = scene;
  const guid = choice.guid;
  if (guid === undefined)
    return {
      blocked: false,
      error: "no_target",
      jev: undefined,
      stopCause: undefined,
    };
  const startedAt = ops.rt.clock.now();
  const end = await awaitTactics(ops.handle, {
    guid,
    instruction: instruction(scene),
    signal: ops.signal,
  });
  const killed = isKill(end.outcome?.reason);
  tally.targets.push({
    durationMs: ops.rt.clock.now() - startedAt,
    name: nameOf(ops, guid),
    outcome: killed ? "killed" : "lost",
    reason: end.outcome?.reason ?? end.error,
    ref: ops.rt.refs.refOf(guid),
    xp: killed ? killXp(end.outcome?.reason) : undefined,
  });
  if (killed && scene.args.loot !== false) await lootCorpseOp(ops, guid);
  return {
    blocked: end.outcome?.status === "blocked",
    error: end.error,
    jev: jevCode(end),
    stopCause: undefined,
  };
}

function nextTargets(scene: Scene, tried: ReadonlySet<bigint>): bigint[] {
  const { choice, ops } = scene;
  const attackers = dangerView(ops).attackers.map((attacker) =>
    ops.rt.refs.guidOf(attacker.ref),
  );
  const same = unitViews(ops)
    .filter(
      (unit) =>
        unit.alive && !unit.tappedByOther && unit.name === choice.unit?.name,
    )
    .map((unit) => ops.rt.refs.guidOf(unit.ref));
  const ordered = [...attackers, choice.guid, ...same].flatMap((guid) =>
    guid === undefined ? [] : [guid],
  );
  return [...new Set(ordered)].filter((guid) => !tried.has(guid));
}

function allBlocked(state: CycleState): boolean {
  const ended = state.queue.filter((record) => record.status !== "queued");
  return (
    ended.length > 0 &&
    ended.every(
      (record) =>
        record.status === "skipped" || record.outcome?.status === "blocked",
    )
  );
}

async function cycle(scene: Scene): Promise<ModeEnd> {
  const { choice, ops, tally } = scene;
  const tried = new Set<bigint>();
  let end: CycleEnd | undefined;
  let blocked = true;
  for (
    let round = 0;
    round <= TOP_UPS && kills(tally) < choice.wanted && !ops.signal.aborted;
    round += 1
  ) {
    const guids = nextTargets(scene, tried);
    if (guids.length === 0) break;
    for (const guid of guids) tried.add(guid);
    end = await awaitCycle(ops.handle, {
      guids,
      instruction: instruction(scene),
      maxStarts: choice.wanted - kills(tally),
      signal: ops.signal,
    });
    noteCycle(ops, tally, end.state);
    blocked &&= allBlocked(end.state);
    if (end.error !== undefined || end.state.stopCause !== "queue_exhausted")
      break;
  }
  const stopCause = end?.state.stopCause;
  return {
    blocked: end !== undefined && blocked,
    error: end?.error,
    jev: stopCause === JEV_UNAVAILABLE ? JEV_UNAVAILABLE : undefined,
    stopCause,
  };
}

async function quest(scene: Scene): Promise<ModeEnd> {
  const { choice, ops, tally } = scene;
  const end = await awaitQuestCycle(ops.handle, {
    instruction: instruction(scene),
    maxStarts: scene.args.count,
    questId: choice.questId ?? 0,
    signal: ops.signal,
    sources: choice.sources,
  });
  noteCycle(ops, tally, end.state);
  const stopCause = end.state.stopCause;
  return {
    blocked: allBlocked(end.state),
    error: end.error,
    jev: stopCause === JEV_UNAVAILABLE ? JEV_UNAVAILABLE : undefined,
    stopCause,
  };
}

function vitalsLine(ctx: ViewCtx): string {
  const vitals = vitalsView(ctx);
  const mana =
    vitals.powerKind === "mana" && vitals.maxPower > 0
      ? `, mana ${Math.round((vitals.power / vitals.maxPower) * 100)}%`
      : "";
  return `You: HP ${vitals.hp}/${vitals.maxHp}${mana}.`;
}

function lootText(tally: Tally): string {
  const parts = tally.loot.map((line) => `${line.name} x${line.count}`);
  if (tally.copper > 0) parts.push(`${tally.copper} copper`);
  return parts.length === 0 ? "" : ` Looted ${parts.join(", ")}.`;
}

function gains(scene: Scene): string {
  const { tally } = scene;
  return `${tally.xp > 0 ? ` +${tally.xp} XP.` : ""}${lootText(tally)} ${vitalsLine(scene.ops)}`;
}

function creditText(tally: Tally, secs: number): string {
  const killed = tally.targets.filter((target) => target.outcome === "killed");
  const noXp = killed.filter((target) => target.xp === 0);
  const why = noXpText(noXp);
  if (noXp.length === 0)
    return `killed ${killNames(tally)} in ${secs} s, server kill credit.`;
  if (noXp.length === killed.length)
    return `killed ${killNames(tally)}; no XP (${why}).`;
  const refs = noXp.map((target) => target.ref).join(", ");
  return `killed ${killNames(tally)} in ${secs} s, server kill credit; no XP for ${refs} (${why}).`;
}

function killedRefs(tally: Tally): string {
  return tally.targets
    .filter((target) => target.outcome === "killed")
    .map((target) => target.ref)
    .join(", ");
}

function diedReport(scene: Scene, secs: number): Report {
  const { ops, choice } = scene;
  const killer = ops.rt.attacks.lastAttacker() ?? choice.guid;
  const who =
    killer === undefined
      ? "something"
      : `${nameOf(ops, killer)} (${ops.rt.refs.refOf(killer)})`;
  const pose = poseView(ops);
  const at = pose ? ` at ${Math.round(pose.x)}, ${Math.round(pose.y)}` : "";
  return result("FAILED", {
    after: afterOf(ops, scene),
    detail: `${who} killed you after ${secs} s. You are dead${at}.`,
    next: nextCall("recover"),
    reason: "died",
  });
}

function stopped(scene: Scene, end: ModeEnd): Report | undefined {
  const after = afterOf(scene.ops, scene);
  if (end.error?.includes(MISSING_KEY))
    return result("REFUSED", {
      after,
      detail: "TYPESAFE_API_KEY is not set.",
      next: "ask the human to set it.",
      reason: "no_combat_helper",
    });
  if (end.jev === JEV_UNAVAILABLE)
    return result("FAILED", {
      after,
      detail: `the fight helper did not answer 3 times in a row. ${killedRefs(scene.tally) || "No kills."}`,
      next: askHuman("The fight helper stopped answering. What should I do?"),
      reason: JEV_UNAVAILABLE,
    });
  if (end.stopCause === "objective_item_sources_unknown")
    return result("REFUSED", {
      after,
      detail:
        "this quest needs items and I do not know which creature drops them.",
      next: nextCall("engage", {
        quest: String(scene.choice.questId),
        target: "<creature name>",
      }),
      reason: "item_sources_unknown",
    });
  if (end.stopCause === "quest_not_in_log" || end.error === "quest_not_in_log")
    return result("REFUSED", {
      after,
      detail: "that quest is not in your quest log.",
      next: nextCall("journal", { about: "quests" }),
      reason: "unknown_quest",
    });
}

function attackerNext(scene: Scene): string | undefined {
  const fought = new Set(scene.tally.targets.map((target) => target.ref));
  const first = dangerView(scene.ops).attackers.find(
    (attacker) => !fought.has(attacker.ref),
  );
  return first ? nextCall("engage", { target: first.ref }) : undefined;
}

function againCall(scene: Scene, left: number): string {
  const { questId } = scene.choice;
  if (scene.choice.mode === "quest" && questId !== undefined)
    return nextCall("engage", { quest: String(questId) });
  const name = scene.choice.unit?.name;
  const call = nextCall(
    "engage",
    name === undefined ? { count: left } : { count: left, target: name },
  );
  const again =
    name === undefined || otherInView(scene)
      ? call
      : `${nextCall("travel", { to: "explore" })}, then ${call}`;
  const vitals = vitalsView(scene.ops);
  const low = vitals.maxHp > 0 && (vitals.hp / vitals.maxHp) * 100 < MIN_HP_PCT;
  return low ? `${nextCall("rest")}, then ${again}` : again;
}

function blockedNext(scene: Scene, why: string): string | undefined {
  const { choice, ops } = scene;
  if (why !== NO_ATTACK || choice.guid === undefined) return;
  const hex = guidHex(choice.guid);
  const unit = unitViews(ops).find((view) => view.guid === hex && view.alive);
  if (!unit) return;
  return `${nextCall("travel", { to: unit.ref })}, then ${nextCall("engage", { target: unit.ref })}`;
}

function outcomeReport(scene: Scene, end: ModeEnd, secs: number): Report {
  const { choice, tally } = scene;
  const after = afterOf(scene.ops, scene);
  const killed = kills(tally);
  const refs = killedRefs(tally);
  const also = attackerNext(scene);
  const complete =
    choice.mode === "quest"
      ? end.stopCause === "objective_complete"
      : killed >= choice.wanted;
  const name = choice.unit?.name ?? "the quest targets";
  if (complete && killed === 0)
    return result("DONE", {
      after,
      detail: `nothing left to kill: the objectives of quest #${choice.questId} are complete. ${vitalsLine(scene.ops)}`,
      next: also,
    });
  if (complete)
    return result("DONE", {
      after,
      detail: `${creditText(tally, secs)}${gains(scene)}`,
      next: also,
    });
  const why =
    end.stopCause ?? end.error ?? tally.targets.at(-1)?.reason ?? "stopped";
  const stop: StopInit = {
    kills: after.kills,
    name,
    targets: tally.targets,
    wanted: after.wanted,
    why,
  };
  if (killed > 0)
    return result("PARTLY", {
      after,
      detail: `${after.kills} of ${after.wanted} kills (${refs}). Stopped: ${stopText(stop)}.${gains(scene)}`,
      next: also ?? againCall(scene, Math.max(1, after.wanted - after.kills)),
      reason: why,
    });
  return result(end.blocked ? "REFUSED" : "FAILED", {
    after,
    detail: `${failText(stop)} ${vitalsLine(scene.ops)}`,
    next:
      also ?? blockedNext(scene, why) ?? nextCall("look", { find: "hostile" }),
    reason: end.blocked ? why : "lost",
  });
}

export async function fight(init: FightInit): Promise<Report> {
  const tally = newTally(init.ops);
  const scene: Scene = {
    ...init,
    how: init.args.how ?? DEFAULT_FIGHT_INSTRUCTION,
    tally,
  };
  const off = watchTally(init.ops, tally);
  const tick = init.ops.handle.onTacticsEvent(() =>
    init.progress(afterOf(init.ops, scene)),
  );
  const credit = init.ops.handle.onCycleEvent((event) => {
    if (init.choice.mode === "single") return;
    noteCycle(init.ops, tally, event.state);
    init.progress(afterOf(init.ops, scene));
  });
  try {
    const blocked = (await approach(scene)) ?? unobserved(scene);
    if (blocked) return blocked;
    const modes = { cycle, quest, single };
    const end = await modes[init.choice.mode](scene);
    const secs = Math.round((init.ops.rt.clock.now() - tally.startedAt) / 1000);
    const died = init.cause()?.code === "died";
    tally.loot = await nameLootLines(
      init.ops,
      tally.loot,
      died ? 0 : ITEM_NAME_WAIT_MS,
    );
    if (died) return diedReport(scene, secs);
    return stopped(scene, end) ?? outcomeReport(scene, end, secs);
  } finally {
    credit();
    tick();
    off();
  }
}
