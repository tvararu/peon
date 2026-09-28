import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet, attachDrafts } from "#harness/areas/rules";
import { createMockGame } from "#test-support/mock-game";
import { testRuleInput } from "#test-support/rule-fixtures";

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

describe("looting harness rules", () => {
  test("a loot_owner event writes no row", () => {
    expect(areaDrafts(areaRuleSet(), LOOT_OWNER, testRuleInput())).toEqual([]);
  });

  test("attach writes no row", () => {
    const rows = attachDrafts(areaRuleSet(), createMockGame(), testRuleInput());
    expect(rows.filter((row) => row.domain === "looting")).toEqual([]);
  });
});
