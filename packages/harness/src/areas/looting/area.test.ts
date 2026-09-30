import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet, attachDrafts } from "#harness/areas/rules";
import { createMockGame } from "#test-support/mock-game";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

const LOOT_OWNER = {
  area: "looting",
  event: {
    creature: 0xf1_30_00_3d_28_01_28_c6n,
    looter: 0n,
    master: 0n,
    mine: "unknown",
    type: "loot_owner",
  },
} as const satisfies AreaEvent;

const MASTER_CANDIDATES = {
  area: "looting",
  event: {
    candidates: [1n, 0x0_0000_0de6n],
    type: "master_loot_candidates",
  },
} as const satisfies AreaEvent;

describe("looting harness rules", () => {
  test("a master_loot_candidates event writes one passive master_loot row", () => {
    const rc = testRuleInput({
      lookup: testLookup({ unitName: () => "Partner" }),
      selfGuid: 1n,
      selfName: "Me",
    });
    expect(areaDrafts(areaRuleSet(), MASTER_CANDIDATES, rc)).toMatchObject([
      {
        class: "passive",
        data: { candidates: ["Me", "Partner"] },
        event: "looting/master_loot",
        text: "Master loot candidates: Me, Partner.",
      },
    ]);
  });

  test("an unknown candidate guid falls back to hex", () => {
    const rc = testRuleInput({ selfGuid: 1n, selfName: "Me" });
    const drafts = areaDrafts(
      areaRuleSet(),
      {
        area: "looting",
        event: { candidates: [0x2an], type: "master_loot_candidates" },
      } as AreaEvent,
      rc,
    );
    expect(drafts).toMatchObject([
      {
        class: "passive",
        data: { candidates: ["0x2a"] },
        event: "looting/master_loot",
        text: "Master loot candidates: 0x2a.",
      },
    ]);
  });

  test("a loot_owner event writes no row", () => {
    expect(areaDrafts(areaRuleSet(), LOOT_OWNER, testRuleInput())).toEqual([]);
  });

  test("attach writes no row", () => {
    const rows = attachDrafts(areaRuleSet(), createMockGame(), testRuleInput());
    expect(rows.filter((row) => row.domain === "looting")).toEqual([]);
  });
});
