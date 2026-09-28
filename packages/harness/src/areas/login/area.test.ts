import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { loginHarness } from "#harness/areas/login/area";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

const NOISE: AreaEvent = {
  area: "login",
  event: {
    addons: 0,
    cacheVersion: 3,
    complaints: 2,
    keyed: 0,
    type: "login_noise",
    voice: 0,
  },
};
const TIMES: AreaEvent = {
  area: "login",
  event: { mask: 0xea, type: "account_data_times" },
};

const PONG: AreaEvent = {
  area: "login",
  event: { rttMs: 40, seq: 3, type: "pong" },
};

describe("login harness rules", () => {
  test("pong writes no row, not even a fallback", () => {
    expect(areaDrafts(areaRuleSet(), PONG, testRuleInput())).toEqual([]);
  });

  test("login_noise writes no row, not even a fallback", () => {
    expect(areaDrafts(areaRuleSet(), NOISE, testRuleInput())).toEqual([]);
  });

  test("account_data_times writes no row", () => {
    expect(areaDrafts(areaRuleSet(), TIMES, testRuleInput())).toEqual([]);
  });

  test("the area has no world act", () => {
    expect(loginHarness.worldActs).toEqual([]);
  });
});
