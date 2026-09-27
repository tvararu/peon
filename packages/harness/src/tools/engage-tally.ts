import type {
  CombatEvent,
  CycleState,
  RewardsEvent,
  TacticsEvent,
} from "@tuicraft/core";
import type {
  CodeWord,
  EngageAfter,
  EngageTarget,
  JevDecisionView,
  LootLine,
} from "#harness/contract/details";
import type { OpsCtx, ViewCtx } from "#harness/contract/services";
import { itemIdText } from "#harness/ops/item-names";
import { guidHex } from "#harness/ops/refs";
import { unitViews, vitalsView } from "#harness/ops/views";
import type { Choice } from "#harness/tools/engage-choose";

export type Tally = {
  startedAt: number;
  xp: number;
  loot: LootLine[];
  copper: number;
  decisions: JevDecisionView[];
  castErrors: Map<string, number>;
  swingErrors: Map<string, number>;
  targets: EngageTarget[];
  labels: Map<number, { name: string; quality: number | null }>;
};

export const DECISIONS_KEPT = 200;
const KILL_CREDIT = "server_kill_credit";
const ACTION_HEAD = /^[a-z]+/;
const KINDS: Record<string, JevDecisionView["kind"]> = {
  attack: "attack",
  cast: "spell",
  face: "face",
  item: "item",
  move: "move",
  spell: "spell",
  use: "item",
};

export function newTally(ctx: ViewCtx): Tally {
  return {
    castErrors: new Map(),
    copper: 0,
    decisions: [],
    labels: new Map(),
    loot: [],
    startedAt: ctx.rt.clock.now(),
    swingErrors: new Map(),
    targets: [],
    xp: 0,
  };
}

function bump(counts: Map<string, number>, word: string): void {
  counts.set(word, (counts.get(word) ?? 0) + 1);
}

function noteCombat(tally: Tally, event: CombatEvent): void {
  const xp = event.state.lastXp;
  if (event.type === "xp" && xp?.kind === "kill") tally.xp += xp.total;
  if (event.type === "cast_failed")
    bump(tally.castErrors, event.reason ?? "unknown");
  if (event.type === "attack_stopped" && event.reason)
    bump(tally.swingErrors, event.reason);
}

function decisionKind(actionId: string): JevDecisionView["kind"] {
  const head = ACTION_HEAD.exec(actionId.toLowerCase())?.[0] ?? "";
  return KINDS[head] ?? "wait";
}

function noteTactics(ctx: ViewCtx, tally: Tally, event: TacticsEvent): void {
  if (event.type !== "applied" && event.type !== "discarded") return;
  const label =
    event.actionId ?? (event.type === "discarded" ? event.reason : "");
  tally.decisions.push({
    at: ctx.rt.clock.now(),
    disposition: event.type,
    kind: decisionKind(label),
    label,
  });
  if (tally.decisions.length > DECISIONS_KEPT) tally.decisions.shift();
}

function noteLabels(ctx: ViewCtx, tally: Tally): void {
  const { loot } = ctx.handle.getRewardsState();
  if (loot.phase !== "open") return;
  for (const item of loot.items)
    tally.labels.set(item.itemId, {
      name: item.name ?? itemIdText(item.itemId),
      quality: item.quality,
    });
}

function notePush(
  tally: Tally,
  pushed: { itemId: number; count: number },
): void {
  const same = tally.loot.find((line) => line.itemId === pushed.itemId);
  if (same) {
    same.count += pushed.count;
    return;
  }
  const label = tally.labels.get(pushed.itemId);
  tally.loot.push({
    count: pushed.count,
    itemId: pushed.itemId,
    name: label?.name ?? itemIdText(pushed.itemId),
    quality: label?.quality ?? null,
  });
}

function noteRewards(ctx: ViewCtx, tally: Tally, event: RewardsEvent): void {
  if (event.type === "loot_opened") noteLabels(ctx, tally);
  const pushed = event.state.lastItemPush;
  if (event.type === "item_push" && pushed) notePush(tally, pushed);
  const notice = event.state.lastMoneyNotice;
  if (event.type === "money_notice" && notice) tally.copper += notice.money;
}

export function watchTally(ctx: ViewCtx, tally: Tally): () => void {
  const offs = [
    ctx.handle.onCombatEvent((event) => noteCombat(tally, event)),
    ctx.handle.onTacticsEvent((event) => noteTactics(ctx, tally, event)),
    ctx.handle.onRewardsEvent((event) => noteRewards(ctx, tally, event)),
  ];
  return () => {
    for (const off of offs) off();
  };
}

export function nameOf(ctx: ViewCtx, guid: bigint): string {
  const hex = guidHex(guid);
  return (
    unitViews(ctx).find((unit) => unit.guid === hex)?.name ??
    ctx.rt.sightings.get(guid)?.name ??
    "a unit"
  );
}

export function isKill(reason: string | undefined): boolean {
  return reason === KILL_CREDIT;
}

export function kills(tally: Tally): number {
  return tally.targets.filter((target) => target.outcome === "killed").length;
}

export function noteCycle(ctx: ViewCtx, tally: Tally, state: CycleState): void {
  for (const record of state.queue) {
    if (record.status === "queued") continue;
    const ref = ctx.rt.refs.refOf(record.guid);
    if (tally.targets.some((target) => target.ref === ref)) continue;
    const killed = isKill(record.outcome?.reason);
    tally.targets.push({
      durationMs: undefined,
      name: nameOf(ctx, record.guid),
      outcome: killed ? "killed" : "skipped",
      reason: killed
        ? record.outcome?.reason
        : (record.cause ?? record.outcome?.reason),
      ref,
      xp: undefined,
    });
  }
}

export function killNames(tally: Tally): string {
  const groups = new Map<string, string[]>();
  for (const target of tally.targets)
    if (target.outcome === "killed")
      groups.set(target.name, [...(groups.get(target.name) ?? []), target.ref]);
  const parts = [...groups].map(([name, refs]) =>
    refs.length === 1
      ? `${name} (${refs.join(", ")})`
      : `${refs.length} ${name} (${refs.join(", ")})`,
  );
  const last = parts.pop();
  return parts.length === 0 ? (last ?? "") : `${parts.join(", ")} and ${last}`;
}

export function questCount(
  ctx: ViewCtx,
  questId: number,
): { kills: number; wanted: number } | undefined {
  const state = ctx.handle.getQuestState();
  const query = state.queries.find((known) => known.questId === questId);
  const slot = state.log.slots.find((known) => known.questId === questId);
  if (query?.status !== "known" || !slot) return;
  const goals = query.data.targets.flatMap((target, index) =>
    target.npcOrGoId > 0 && target.count > 0
      ? [{ current: slot.counters[index] ?? 0, required: target.count }]
      : [],
  );
  if (goals.length === 0) return;
  return {
    kills: goals.reduce(
      (sum, goal) => sum + Math.min(goal.current, goal.required),
      0,
    ),
    wanted: goals.reduce((sum, goal) => sum + goal.required, 0),
  };
}

function killCounts(
  ops: OpsCtx,
  choice: Choice,
  tally: Tally,
): { kills: number; wanted: number } {
  const own = { kills: kills(tally), wanted: choice.wanted };
  if (choice.mode !== "quest" || choice.wanted > 0) return own;
  return questCount(ops, choice.questId ?? 0) ?? own;
}

function words(counts: Map<string, number>): CodeWord[] {
  return [...counts].map(([word, count]) => {
    const code = Number(word);
    return { code: Number.isInteger(code) ? code : -1, count, word };
  });
}

export function afterOf(
  ops: OpsCtx,
  init: { choice: Choice; how: string; tally: Tally },
): EngageAfter {
  const { choice, how, tally } = init;
  const target = ops.handle.getCombatState().target?.guid;
  const count = killCounts(ops, choice, tally);
  const hex = target === undefined ? undefined : guidHex(target);
  return {
    cast: undefined,
    castErrors: words(tally.castErrors),
    copper: tally.copper,
    current: unitViews(ops).find((unit) => unit.guid === hex && unit.alive),
    decisions: tally.decisions,
    how,
    kills: count.kills,
    loot: tally.loot,
    mode: choice.mode,
    questId: choice.questId,
    self: vitalsView(ops),
    swingErrors: words(tally.swingErrors),
    targets: tally.targets,
    timeouts: ops.handle.getTacticsState().timeouts.total,
    wanted: count.wanted,
    xp: tally.xp,
  };
}
