import type { EngageAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { RunControl } from "#harness/contract/runs";
import type { OpsCtx, ToolCtx, ViewCtx } from "#harness/contract/services";
import type { UnitView } from "#harness/contract/views";
import { dangerView, type InterruptCause } from "#harness/ops/danger";
import { explore } from "#harness/ops/explore";
import { Refusal } from "#harness/ops/refusal";
import { resolveUnit, unitRefusal } from "#harness/ops/resolve";
import { selfView, unitViews, vitalsView } from "#harness/ops/views";
import { askHuman, nextCall } from "#harness/tools/define";
import type { EngageArgs } from "#harness/tools/params";

export type EngageMode = EngageAfter["mode"];
export type Choice = {
  mode: EngageMode;
  unit: UnitView | undefined;
  guid: bigint | undefined;
  named: boolean;
  questId: number | undefined;
  sources: number[];
  wanted: number;
};

export type FightInit = {
  ops: OpsCtx;
  choice: Choice;
  args: EngageArgs;
  control: RunControl;
  cause: () => InterruptCause | undefined;
  progress: (after: EngageAfter) => void;
};
export type FightRun = (init: FightInit) => Promise<ToolResult<EngageAfter>>;

export const LEVEL_CAP_ABOVE = 3;
export const MIN_HP_PCT = 50;
export const MIN_MANA_PCT = 30;
export const EXPLORE_TRIES = 3;
const QUEST_ID = /^#?(\d+)$/;

function unitGuid(ctx: ViewCtx, unit: UnitView): bigint {
  const guid = ctx.rt.refs.guidOf(unit.ref);
  if (guid === undefined) throw new Error(`unknown ref ${unit.ref}`);
  return guid;
}

export function sameArgs(args: EngageArgs): string {
  const init: Record<string, string | number | boolean> = {};
  if (args.target !== undefined) init["target"] = args.target;
  if (args.count !== undefined) init["count"] = args.count;
  if (args.quest !== undefined) init["quest"] = args.quest;
  if (args.how !== undefined) init["how"] = args.how;
  if (args.loot !== undefined) init["loot"] = args.loot;
  return nextCall("engage", init);
}

function questTitles(ctx: ViewCtx): Map<number, string> {
  const titles = new Map<number, string>();
  for (const query of ctx.handle.getQuestState().queries)
    if (query.status === "known") titles.set(query.questId, query.data.title);
  return titles;
}

export function parseQuest(ctx: ViewCtx, text: string): number {
  const inLog = ctx.handle
    .getQuestState()
    .log.slots.flatMap((slot) =>
      slot.questId === undefined || slot.questId === 0 ? [] : [slot.questId],
    );
  const titles = questTitles(ctx);
  const id = QUEST_ID.exec(text.trim())?.[1];
  const wanted = text.trim().toLowerCase();
  const found =
    id === undefined
      ? inLog.find((questId) =>
          titles.get(questId)?.toLowerCase().includes(wanted),
        )
      : inLog.find((questId) => questId === Number(id));
  if (found !== undefined) return found;
  throw new Refusal({
    body: inLog.map(
      (questId) => `#${questId} ${titles.get(questId) ?? "(title not loaded)"}`,
    ),
    detail: `no quest "${text}" in your quest log.`,
    next: nextCall("journal", { about: "quests" }),
    reason: "unknown_quest",
  });
}

function tooStrong(unit: UnitView, level: number): Refusal {
  return new Refusal({
    detail: `${unit.name} ${unit.ref} is L${unit.level}, ${unit.level - level} levels above you. If the human asked for this fight: ${nextCall("engage", { target: unit.ref })}.`,
    reason: "too_strong",
  });
}

function hostiles(ctx: ViewCtx): UnitView[] {
  return unitViews(ctx).filter(
    (unit) =>
      unit.inView &&
      unit.alive &&
      unit.attackable &&
      unit.relation === "hostile" &&
      !unit.tappedByOther,
  );
}

function wantsHostile(unit: UnitView): boolean {
  return unit.attackable && unit.relation === "hostile";
}

async function findUnnamed(ops: OpsCtx): Promise<UnitView> {
  for (
    let tries = 0;
    tries < EXPLORE_TRIES && hostiles(ops).length === 0;
    tries += 1
  )
    await explore(ops, { direction: undefined, wanted: wantsHostile });
  const { level } = selfView(ops);
  const all = hostiles(ops);
  const fit = all.find((unit) => unit.level <= level + LEVEL_CAP_ABOVE);
  if (fit) return fit;
  const [strong] = all;
  if (strong) throw tooStrong(strong, level);
  throw new Refusal({
    detail: `no hostile unit you can attack came into view after ${EXPLORE_TRIES} explore walks.`,
    next: askHuman("Where should I look for enemies?"),
    reason: "not_seen",
  });
}

function tappedByOther(ctx: ViewCtx, unit: UnitView): Refusal {
  const free = hostiles(ctx).find(
    (view) => view.name === unit.name && view.ref !== unit.ref,
  );
  return new Refusal({
    detail: `${unit.name} ${unit.ref} is tapped by another player; killing it gives you no loot, experience or quest credit.`,
    next: free ? nextCall("engage", { target: free.ref }) : nextCall("engage"),
    reason: "tapped_by_other",
  });
}

async function findNamed(ops: OpsCtx, text: string): Promise<UnitView> {
  const lower = text.toLowerCase();
  let resolved = resolveUnit(ops, { alive: true, text });
  for (
    let tries = 0;
    resolved.kind === "not_seen" && tries < EXPLORE_TRIES;
    tries += 1
  ) {
    await explore(ops, {
      direction: undefined,
      wanted: (unit) => unit.name.toLowerCase().includes(lower),
    });
    resolved = resolveUnit(ops, { alive: true, text });
  }
  if (resolved.kind !== "unit")
    throw unitRefusal({ param: "target", resolved, tool: "engage" });
  if (resolved.unit.tappedByOther) throw tappedByOther(ops, resolved.unit);
  return resolved.unit;
}

function checkRelation(unit: UnitView): void {
  if (unit.relation === "friendly")
    throw new Refusal({
      detail: `${unit.name} ${unit.ref} is friendly.`,
      next: nextCall("look", { find: "hostile" }),
      reason: "friendly",
    });
}

function modeOf(questId: number | undefined, count: number): EngageMode {
  if (questId !== undefined) return "quest";
  return count > 1 ? "cycle" : "single";
}

export async function chooseTarget(
  ops: OpsCtx,
  args: EngageArgs,
): Promise<Choice> {
  const questId =
    args.quest === undefined ? undefined : parseQuest(ops, args.quest);
  if (questId !== undefined && args.target === undefined)
    return {
      guid: undefined,
      mode: "quest",
      named: false,
      questId,
      sources: [],
      unit: undefined,
      wanted: args.count ?? 0,
    };
  const [attacker] = dangerView(ops).attackers;
  const attacking = attacker
    ? unitViews(ops).find((view) => view.ref === attacker.ref)
    : undefined;
  const unit =
    args.target === undefined
      ? (attacking ?? (await findUnnamed(ops)))
      : await findNamed(ops, args.target);
  checkRelation(unit);
  const count = args.count ?? 1;
  return {
    guid: unitGuid(ops, unit),
    mode: modeOf(questId, count),
    named: args.target !== undefined,
    questId,
    sources: questId === undefined ? [] : [unit.entry],
    unit,
    wanted: questId === undefined ? count : (args.count ?? 0),
  };
}

export function guardPull(ctx: ToolCtx<EngageAfter>, args: EngageArgs): void {
  const self = selfView(ctx);
  if (self.life !== "alive")
    throw new Refusal({
      detail: "you are dead.",
      next: nextCall("recover"),
      reason: "dead",
    });
  const [attacker] = dangerView(ctx).attackers;
  const target = args.target?.toLowerCase();
  const defending =
    attacker !== undefined &&
    (target === undefined ||
      attacker.ref === target ||
      attacker.name.toLowerCase().includes(target));
  if (attacker && !defending)
    throw new Refusal({
      detail: `${attacker.name} ${attacker.ref} is attacking you; fight it first.`,
      next: nextCall("engage", { target: attacker.ref }),
      reason: "other_attacker",
    });
  if (defending) return;
  const vitals = vitalsView(ctx);
  const rest = `${nextCall("rest")}, then ${sameArgs(args)}`;
  if (vitals.maxHp > 0 && (vitals.hp / vitals.maxHp) * 100 < MIN_HP_PCT)
    throw new Refusal({
      detail: `you are at ${Math.round((vitals.hp / vitals.maxHp) * 100)}% HP; pull at ${MIN_HP_PCT}% or more.`,
      next: rest,
      reason: "low_health",
    });
  if (
    vitals.powerKind === "mana" &&
    vitals.maxPower > 0 &&
    (vitals.power / vitals.maxPower) * 100 < MIN_MANA_PCT
  )
    throw new Refusal({
      detail: `you are at ${Math.round((vitals.power / vitals.maxPower) * 100)}% mana; pull at ${MIN_MANA_PCT}% or more.`,
      next: rest,
      reason: "low_mana",
    });
}

export function checkHelper(ctx: ToolCtx<EngageAfter>): void {
  const jev = (() => {
    try {
      return ctx.handle.capabilities().jev;
    } catch {
      return true;
    }
  })();
  if (!jev)
    throw new Refusal({
      detail: "TYPESAFE_API_KEY is not set.",
      next: "ask the human to set it.",
      reason: "no_combat_helper",
    });
}
