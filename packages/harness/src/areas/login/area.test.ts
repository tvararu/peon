import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

const PONG: AreaEvent = {
  area: "login",
  event: { rttMs: 40, seq: 3, type: "pong" },
};

describe("login harness rules", () => {
  test("pong writes no row, not even a fallback", () => {
    expect(areaDrafts(areaRuleSet(), PONG, testRuleInput())).toEqual([]);
  });
});
