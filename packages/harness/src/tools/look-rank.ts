import type { ViewCtx } from "#harness/contract/services";
import type { UnitView } from "#harness/contract/views";
import { critter } from "#harness/ops/explore-wanted";
import { questGoal } from "#harness/ops/quest-memory";
import { guidHex } from "#harness/ops/refs";
import { staticRole } from "#harness/ops/sightings";

type Relevance = {
  attackers: ReadonlySet<string>;
  questNpcs: ReadonlySet<string>;
  said: string;
};

export const MORE_NAMES = 5;
const HUMAN_LOOKBACK = 200;
const FAR = Number.MAX_SAFE_INTEGER;

function questNpcs(ctx: ViewCtx): Set<string> {
  const names = new Set<string>();
  for (const slot of ctx.handle.getQuestState().log.slots) {
    if (!slot.questId) continue;
    const giver = ctx.rt.quests.get(slot.questId)?.giver;
    for (const name of [questGoal(ctx, slot.questId).ender, giver])
      if (name) names.add(name.toLowerCase());
  }
  return names;
}

function saidText(ctx: ViewCtx): string {
  const human = ctx.rt.log
    .recent(HUMAN_LOOKBACK)
    .filter((entry) => entry.event === "human/input")
    .map((entry) => entry.text);
  const goals = ctx.handle
    .getQuestState()
    .log.slots.map((slot) =>
      slot.questId ? questGoal(ctx, slot.questId).objectives : "",
    );
  return [...human, ...goals].join("\n").toLowerCase();
}

export function relevanceOf(ctx: ViewCtx): Relevance {
  return {
    attackers: new Set(ctx.handle.getCombatState().attackers.map(guidHex)),
    questNpcs: questNpcs(ctx),
    said: saidText(ctx),
  };
}

function rankOf(unit: UnitView, relevance: Relevance): number {
  const name = unit.name.toLowerCase();
  if (unit.attackingMe || relevance.attackers.has(unit.guid)) return 0;
  if (relevance.questNpcs.has(name)) return 1;
  if (name !== "unknown" && relevance.said.includes(name)) return 2;
  if (unit.relation === "hostile" && unit.alive) return 3;
  if (staticRole(unit)) return 4;
  return critter(unit) ? 6 : 5;
}

export function byRelevance(
  units: readonly UnitView[],
  relevance: Relevance,
): UnitView[] {
  return units
    .map((unit) => ({ rank: rankOf(unit, relevance), unit }))
    .sort(
      (a, b) =>
        a.rank - b.rank || (a.unit.distance ?? FAR) - (b.unit.distance ?? FAR),
    )
    .map(({ unit }) => unit);
}
