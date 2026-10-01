import type { TalentCatalog } from "#wow/areas/talents/catalog";
import type { TalentRank } from "#wow/protocol/talent-spec";

export const MAX_TALENT_RANK = 5;

export type TalentRefusal =
  | "unknown_talent"
  | "wrong_class"
  | "bad_rank"
  | "rank_held"
  | "no_points"
  | "not_enough_points"
  | "tier_locked"
  | "needs_prerequisite";

export type RulesCatalog = Pick<TalentCatalog, "talent" | "tab">;

export type RulesState = {
  classId: number;
  freePoints: number | undefined;
  held: ReadonlyMap<number, number>;
};

export type PlanRefusal = { entry: TalentRank; reason: TalentRefusal };
export type OrderedPlan = { send: TalentRank[]; refused: PlanRefusal[] };

function heldRank(state: RulesState, talentId: number): number {
  return state.held.get(talentId) ?? 0;
}

function spentInTab(
  state: RulesState,
  catalog: RulesCatalog,
  tabId: number,
): number {
  let spent = 0;
  for (const [talentId, rank] of state.held)
    if (catalog.talent(talentId)?.tab === tabId) spent += rank;
  return spent;
}

export function checkEntry(
  entry: TalentRank,
  state: RulesState,
  catalog: RulesCatalog,
): TalentRefusal | undefined {
  if (state.freePoints === 0) return "no_points";
  if (entry.rank >= MAX_TALENT_RANK) return "bad_rank";
  const talent = catalog.talent(entry.talentId);
  if (!talent) return "unknown_talent";
  const tab = catalog.tab(talent.tab);
  if (!tab) return "unknown_talent";
  if ((tab.classMask & (1 << (state.classId - 1))) === 0) return "wrong_class";
  const current = heldRank(state, entry.talentId);
  if (current >= entry.rank + 1) return "rank_held";
  const cost = entry.rank - current + 1;
  if (state.freePoints !== undefined && state.freePoints < cost)
    return "not_enough_points";
  if (
    talent.requires &&
    heldRank(state, talent.requires.talentId) < talent.requires.rank + 1
  )
    return "needs_prerequisite";
  if (
    talent.row > 0 &&
    spentInTab(state, catalog, talent.tab) < talent.row * MAX_TALENT_RANK
  )
    return "tier_locked";
  if (talent.ranks[entry.rank] === undefined) return "bad_rank";
  return undefined;
}

export function applyEntry(entry: TalentRank, state: RulesState): RulesState {
  const held = new Map(state.held);
  const current = heldRank(state, entry.talentId);
  held.set(entry.talentId, entry.rank + 1);
  return {
    ...state,
    freePoints:
      state.freePoints === undefined
        ? undefined
        : state.freePoints - (entry.rank - current + 1),
    held,
  };
}

export function orderPlan(
  plan: readonly TalentRank[],
  state: RulesState,
  catalog: RulesCatalog,
): OrderedPlan {
  const sorted = [...plan].sort(
    (a, b) =>
      (catalog.talent(a.talentId)?.row ?? -1) -
        (catalog.talent(b.talentId)?.row ?? -1) || a.rank - b.rank,
  );
  const send: TalentRank[] = [];
  const refused: PlanRefusal[] = [];
  let current = state;
  let deferred = sorted;
  while (deferred.length > 0) {
    const waiting: PlanRefusal[] = [];
    let progressed = false;
    for (const entry of deferred) {
      const reason = checkEntry(entry, current, catalog);
      if (!reason) {
        send.push(entry);
        current = applyEntry(entry, current);
        progressed = true;
        continue;
      }
      if (reason === "needs_prerequisite" || reason === "tier_locked")
        waiting.push({ entry, reason });
      else refused.push({ entry, reason });
    }
    if (!progressed) {
      refused.push(...waiting);
      return { refused, send };
    }
    deferred = waiting.map((refusal) => refusal.entry);
  }
  return { refused, send };
}
