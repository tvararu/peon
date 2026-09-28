import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

const ME = 0x2an;
const BOAR = 0xf1_30_00_3e_ea_00_0a_bcn;

function entry(): AreaEvent {
  return {
    area: "combatlog",
    event: {
      amount: 9,
      at: 50,
      kind: "melee",
      source: BOAR,
      target: ME,
      type: "entry",
    },
  };
}

describe("combatlog harness rules", () => {
  test("an entry event writes no row", () => {
    expect(areaDrafts(areaRuleSet(), entry(), testRuleInput())).toEqual([]);
  });
});
