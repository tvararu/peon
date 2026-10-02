import { describe, expect, test } from "bun:test";
import type { AreaEventOf } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

function battlegrounds(event: AreaEventOf<"battlegrounds">) {
  return { area: "battlegrounds" as const, event };
}

describe("battlegrounds harness rules", () => {
  test("pvp_flag writes one battlegrounds/flag log row", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      battlegrounds({
        contested: false,
        ffa: false,
        flagged: true,
        sanctuary: false,
        timer: false,
        type: "pvp_flag",
        wants: true,
      }),
      testRuleInput({}),
    );
    expect<unknown[]>(rows).toEqual([
      {
        class: "log",
        data: { flagged: true, timer: false, wants: true },
        domain: "battlegrounds",
        event: "battlegrounds/flag",
        text: "PvP flag is on.",
      },
    ]);
  });

  test("honor_credit writes one battlegrounds/honor log row", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      battlegrounds({
        honor: 100,
        rank: 2,
        type: "honor_credit",
        victim: 0n,
      }),
      testRuleInput({}),
    );
    expect<unknown[]>(rows).toEqual([
      {
        class: "log",
        data: { honor: 100, rank: 2 },
        domain: "battlegrounds",
        event: "battlegrounds/honor",
        text: "Earned 100 honor.",
      },
    ]);
  });

  test("zone_under_attack is always passive in wave 5 (no area id in RuleInput)", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      battlegrounds({
        areaId: 42,
        at: 0,
        here: false,
        type: "zone_under_attack",
      }),
      testRuleInput({}),
    );
    expect<unknown[]>(rows).toEqual([
      {
        class: "passive",
        data: { areaId: 42 },
        domain: "battlegrounds",
        event: "battlegrounds/zone_attack",
        text: "Zone 42 is under attack.",
      },
    ]);
  });

  test("honor_inspect and pvp_kill_quest write log rows", () => {
    const inspectRows = areaDrafts(
      areaRuleSet(),
      battlegrounds({
        guid: 11n,
        honor: 12,
        kills: 3,
        lifetime: 44,
        today: 7,
        type: "honor_inspect",
        yesterday: 9,
      }),
      testRuleInput({}),
    );
    expect(inspectRows.map((row) => row.event)).toEqual([
      "battlegrounds/inspect",
    ]);
    const questRows = areaDrafts(
      areaRuleSet(),
      battlegrounds({
        count: 2,
        quest: 13_233,
        required: 15,
        type: "pvp_kill_quest",
      }),
      testRuleInput({}),
    );
    expect(questRows.map((row) => row.event)).toEqual(["battlegrounds/kill"]);
  });
});
