import type { AreaEventOf, CombatEvent, RewardsEvent } from "@peon/core";
import { newSums, noteEntry, type Sums } from "#harness/areas/combatlog/totals";
import type {
  CodeWord,
  EngageAfter,
  EngageTarget,
  JevDecisionView,
  LootLine,
} from "#harness/contract/details";
import type { OpsCtx, ViewCtx } from "#harness/contract/services";
import { petOf } from "#harness/loops/combat-actions-pet";
import type { CycleState } from "#harness/loops/cycle-types";
import type { TacticsEvent } from "#harness/loops/tactics";
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
  sums: Sums;
  pets: Set<bigint>;
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
  pet: "attack",
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
    pets: new Set(),
    startedAt: ctx.rt.clock.now(),
    sums: newSums(),
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

export function decisionKind(actionId: string): JevDecisionView["kind"] {
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

function noteLog(
  ctx: ViewCtx,
  tally: Tally,
  event: AreaEventOf<"combatlog">,
): void {
  if (event.type !== "entry") return;
  const { handle } = ctx;
  const self = handle.getCombatState().self.guid;
  const pet = petOf((guid) => handle.getEntity(guid), self)?.guid;
  if (pet !== undefined) tally.pets.add(pet);
  noteEntry(
    tally.sums,
    event,
    self,
    (guid) => guid === self || tally.pets.has(guid),
  );
}

export function watchTally(ctx: ViewCtx, tally: Tally): () => void {
  const offs = [
    ctx.handle.onCombatEvent((event) => noteCombat(tally, event)),
    ctx.handle.onTacticsEvent((event) => noteTactics(ctx, tally, event)),
    ctx.handle.onRewardsEvent((event) => noteRewards(ctx, tally, event)),
    ctx.handle.combatlog.onEvent((event) => noteLog(ctx, tally, event)),
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

const NO_XP_KILLS = new Set(["gray", "no_xp_kill"]);

export function isKill(reason: string | undefined): boolean {
  return reason === KILL_CREDIT || NO_XP_KILLS.has(reason ?? "");
}

export function killXp(reason: string | undefined): number | undefined {
  return NO_XP_KILLS.has(reason ?? "") ? 0 : undefined;
}

export function kills(tally: Tally): number {
  return tally.targets.filter((target) => target.outcome === "killed").length;
}

function cycleTarget(
  ctx: ViewCtx,
  record: CycleState["queue"][number],
  ref: string,
): EngageTarget {
  const killed = isKill(record.outcome?.reason);
  return {
    durationMs: undefined,
    name: nameOf(ctx, record.guid),
    outcome: killed ? "killed" : "skipped",
    reason: killed
      ? record.outcome?.reason
      : (record.cause ?? record.outcome?.reason),
    ref,
    xp: killed ? killXp(record.outcome?.reason) : undefined,
  };
}

export function noteCycle(ctx: ViewCtx, tally: Tally, state: CycleState): void {
  for (const record of state.queue) {
    if (record.status === "queued") continue;
    const ref = ctx.rt.refs.refOf(record.guid);
    const known = tally.targets.findIndex((target) => target.ref === ref);
    const entry = cycleTarget(ctx, record, ref);
    if (known < 0) tally.targets.push(entry);
    else if (
      entry.outcome === "killed" &&
      tally.targets[known]?.outcome !== "killed"
    )
      tally.targets[known] = entry;
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

export type FightFigures = {
  dealt: number;
  taken: number;
  healed: number;
  avoided: CodeWord[];
  immune: string[];
  immuneCount: number;
};

export function fightFigures(ops: OpsCtx, tally: Tally): FightFigures {
  const { handle } = ops;
  const { sums } = tally;
  return {
    avoided: Object.entries(sums.avoided).map(([word, count]) => ({
      code: -1,
      count,
      word,
    })),
    dealt: sums.dealt,
    healed: sums.healed,
    immune: sums.immune.map(
      (id) => handle.spellDefinition(id)?.name ?? `spell ${id}`,
    ),
    immuneCount: sums.immuneCount,
    taken: sums.taken,
  };
}

export function fightLine(figures: FightFigures): string {
  const { avoided, dealt, healed, immune, taken } = figures;
  if (dealt + taken + healed === 0 && avoided.length + immune.length === 0)
    return "";
  const heal = healed > 0 ? `, healed ${healed}` : "";
  const dodged =
    avoided.length === 0
      ? ""
      : `; avoided: ${avoided.map((a) => `${a.word} x${a.count}`).join(", ")}`;
  const refused = immune.length === 0 ? "" : `; immune: ${immune.join(", ")}`;
  return `Dealt ${dealt}, took ${taken}${heal}${dodged}${refused}.`;
}

export function afterOf(
  ops: OpsCtx,
  init: { choice: Choice; how: string; tally: Tally },
): EngageAfter {
  const { choice, how, tally } = init;
  const target = ops.handle.getCombatState().target?.guid;
  const count = killCounts(ops, choice, tally);
  const hex = target === undefined ? undefined : guidHex(target);
  const figures = fightFigures(ops, tally);
  const refused: CodeWord[] =
    figures.immuneCount > 0
      ? [{ code: -1, count: figures.immuneCount, word: "immune" }]
      : [];
  return {
    avoided: figures.avoided,
    cast: undefined,
    castErrors: [...words(tally.castErrors), ...refused],
    copper: tally.copper,
    current: unitViews(ops).find((unit) => unit.guid === hex && unit.alive),
    dealt: figures.dealt,
    decisions: tally.decisions,
    healed: figures.healed,
    how,
    immune: figures.immune,
    kills: count.kills,
    loot: tally.loot,
    mode: choice.mode,
    questId: choice.questId,
    self: vitalsView(ops),
    swingErrors: words(tally.swingErrors),
    taken: figures.taken,
    targets: tally.targets,
    timeouts: ops.handle.getTacticsState().timeouts.total,
    wanted: count.wanted,
    xp: tally.xp,
  };
}
