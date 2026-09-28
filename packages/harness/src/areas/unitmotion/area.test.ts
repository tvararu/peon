import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

const UNIT = 0xf1_30_00_3e_ea_00_0a_bcn;

describe("unitmotion harness rules", () => {
  test("a speed, flag or removed event writes no row", () => {
    const events: AreaEvent[] = [
      {
        area: "unitmotion",
        event: {
          guid: UNIT,
          kind: "run",
          previous: 7,
          self: false,
          type: "speed",
          value: 3.5,
        },
      },
      {
        area: "unitmotion",
        event: {
          flag: "hover",
          flags: 0,
          guid: UNIT,
          on: false,
          self: false,
          type: "flag",
        },
      },
      {
        area: "unitmotion",
        event: { guid: UNIT, self: false, type: "removed" },
      },
    ];
    const rules = areaRuleSet();
    for (const event of events)
      expect(areaDrafts(rules, event, testRuleInput())).toEqual([]);
  });
});
