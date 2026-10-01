import { describe, expect, test } from "bun:test";
import {
  TALENTS_TAB_NAMES,
  talentsCatalogFiles,
  talentsTabDbc,
  talentsTalentDbc,
} from "#test-support/areas/talents";
import { dbcFiles } from "#test-support/dbc";
import { loadTalentCatalog } from "#wow/areas/talents/catalog";
import {
  applyEntry,
  checkEntry,
  orderPlan,
  type RulesState,
} from "#wow/areas/talents/rules";
import type { TalentRank } from "#wow/protocol/talent-spec";

const WARRIOR_FILES = talentsCatalogFiles();

function warrior(over: Partial<RulesState> = {}): RulesState {
  return { classId: 1, freePoints: 5, held: new Map(), ...over };
}

function entry(talentId: number, rank: number): TalentRank {
  return { rank, talentId };
}

describe("checkEntry mirrors Player::LearnTalent", () => {
  test("no_points when nothing is free (Player.cpp:14273-14276)", async () => {
    const catalog = await loadTalentCatalog(dbcFiles(WARRIOR_FILES));
    expect(checkEntry(entry(1, 0), warrior({ freePoints: 0 }), catalog)).toBe(
      "no_points",
    );
  });

  test("bad_rank above wire rank 4 (Player.cpp:14283)", async () => {
    const catalog = await loadTalentCatalog(dbcFiles(WARRIOR_FILES));
    expect(checkEntry(entry(1, 5), warrior(), catalog)).toBe("bad_rank");
  });

  test("unknown_talent for an id the catalog never saw (Player.cpp:14288-14289)", async () => {
    const catalog = await loadTalentCatalog(dbcFiles(WARRIOR_FILES));
    expect(checkEntry(entry(9999, 0), warrior(), catalog)).toBe(
      "unknown_talent",
    );
  });

  test("wrong_class for another class tab (Player.cpp:14298)", async () => {
    const catalog = await loadTalentCatalog(dbcFiles(WARRIOR_FILES));
    expect(checkEntry(entry(3, 0), warrior(), catalog)).toBe("wrong_class");
  });

  test("rank_held when the rank is already learned (Player.cpp:14311-14313)", async () => {
    const catalog = await loadTalentCatalog(dbcFiles(WARRIOR_FILES));
    expect(
      checkEntry(entry(1, 0), warrior({ held: new Map([[1, 1]]) }), catalog),
    ).toBe("rank_held");
  });

  test("not_enough_points for a jump costing rank minus held plus one (Player.cpp:14316)", async () => {
    const catalog = await loadTalentCatalog(dbcFiles(WARRIOR_FILES));
    expect(checkEntry(entry(1, 2), warrior({ freePoints: 2 }), catalog)).toBe(
      "not_enough_points",
    );
  });

  test("needs_prerequisite below the required rank (Player.cpp:14327)", async () => {
    const catalog = await loadTalentCatalog(dbcFiles(WARRIOR_FILES));
    expect(
      checkEntry(entry(2, 0), warrior({ held: new Map([[1, 1]]) }), catalog),
    ).toBe("needs_prerequisite");
  });

  test("tier_locked below row times five points spent (Player.cpp:14363)", async () => {
    const catalog = await loadTalentCatalog(dbcFiles(WARRIOR_FILES));
    expect(
      checkEntry(entry(2, 0), warrior({ held: new Map([[1, 3]]) }), catalog),
    ).toBe("tier_locked");
  });

  test("bad_rank for a rank with no spell id (Player.cpp:14367-14369)", async () => {
    const catalog = await loadTalentCatalog(dbcFiles(WARRIOR_FILES));
    expect(checkEntry(entry(1, 3), warrior(), catalog)).toBe("bad_rank");
  });

  test("a legal rank passes", async () => {
    const catalog = await loadTalentCatalog(dbcFiles(WARRIOR_FILES));
    expect(checkEntry(entry(1, 0), warrior(), catalog)).toBeUndefined();
  });
});

describe("orderPlan", () => {
  function orderedCatalog() {
    const files = new Map(WARRIOR_FILES);
    files.set(
      "Talent.dbc",
      talentsTalentDbc([
        { column: 0, id: 10, ranks: [100, 101], row: 0, tab: 161 },
        {
          column: 1,
          id: 11,
          ranks: [102, 103],
          requiresRank: 0,
          requiresTalent: 10,
          row: 0,
          tab: 161,
        },
      ]),
    );
    files.set(
      "TalentTab.dbc",
      talentsTabDbc([
        { classMask: 1, id: 161, name: TALENTS_TAB_NAMES.arms, page: 0 },
      ]),
    );
    return loadTalentCatalog(dbcFiles(files));
  }

  test("a dependent listed first is ordered after its prerequisite and both send", async () => {
    const catalog = await orderedCatalog();
    const plan = orderPlan([entry(11, 1), entry(10, 0)], warrior(), catalog);
    expect(plan.send).toEqual([entry(10, 0), entry(11, 1)]);
    expect(plan.refused).toEqual([]);
  });

  test("equal-rank entries listed dependent first still send the prerequisite first", async () => {
    const catalog = await orderedCatalog();
    const plan = orderPlan([entry(11, 0), entry(10, 0)], warrior(), catalog);
    expect(plan.send).toEqual([entry(10, 0), entry(11, 0)]);
    expect(plan.refused).toEqual([]);
  });

  test("a dependent whose prerequisite is not in the plan is refused", async () => {
    const catalog = await orderedCatalog();
    const plan = orderPlan([entry(11, 0)], warrior(), catalog);
    expect(plan.send).toEqual([]);
    expect(plan.refused).toEqual([
      { entry: entry(11, 0), reason: "needs_prerequisite" },
    ]);
  });

  test("later entries see earlier ones: two ranks of one talent cost two points", async () => {
    const catalog = await loadTalentCatalog(dbcFiles(WARRIOR_FILES));
    const ok = orderPlan(
      [entry(1, 0), entry(1, 1)],
      warrior({ freePoints: 2 }),
      catalog,
    );
    expect(ok.send).toHaveLength(2);
    expect(ok.refused).toEqual([]);
    const broke = orderPlan(
      [entry(1, 0), entry(1, 2)],
      warrior({ freePoints: 2 }),
      catalog,
    );
    expect(broke.send).toEqual([entry(1, 0)]);
    expect(broke.refused).toEqual([
      { entry: entry(1, 2), reason: "not_enough_points" },
    ]);
  });

  test("an entry still illegal after ordering is refused, never sent", async () => {
    const catalog = await loadTalentCatalog(dbcFiles(WARRIOR_FILES));
    const plan = orderPlan([entry(2, 0), entry(3, 0)], warrior(), catalog);
    expect(plan.send).toEqual([]);
    expect(plan.refused.map((refusal) => refusal.reason).sort()).toEqual([
      "needs_prerequisite",
      "wrong_class",
    ]);
  });
});

describe("applyEntry", () => {
  test("holds the rank and spends the jump cost", () => {
    const next = applyEntry(entry(1, 2), warrior({ freePoints: 5 }));
    expect(next.held.get(1)).toBe(3);
    expect(next.freePoints).toBe(2);
  });
});
