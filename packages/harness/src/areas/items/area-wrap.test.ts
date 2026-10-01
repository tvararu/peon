import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

const GUID = 0x40_00_00_00_00_00_00_02n;
const HEX = "4000000000000002";

function event(type: string, extra: Record<string, unknown>): AreaEvent {
  return {
    area: "items",
    event: { entry: 25, itemGuid: GUID, kind: "wrap", type, ...extra },
  } as unknown as AreaEvent;
}

describe("items harness rules: gift wrap", () => {
  test("a confirmed wrap logs a Wrapped row under its own name, not Moved", () => {
    const rc = testRuleInput({
      lookup: testLookup({ itemName: () => "Worn Shortsword" }),
    });
    expect(areaDrafts(areaRuleSet(), event("moved", {}), rc)).toEqual([
      {
        class: "log",
        data: { entry: 25, item: HEX, kind: "wrap" },
        domain: "items",
        event: "items/wrapped",
        guid: HEX,
        ref: HEX,
        text: "Wrapped Worn Shortsword.",
      },
    ]);
  });

  test("a refused wrap wakes the agent with the server's reason", () => {
    expect(
      areaDrafts(
        areaRuleSet(),
        event("move_refused", {
          reason: "equipped_cant_be_wrapped",
          result: 44,
        }),
        testRuleInput(),
      ),
    ).toEqual([
      {
        class: "wake",
        data: { entry: 25, reason: "equipped_cant_be_wrapped" },
        domain: "items",
        event: "items/refused",
        guid: HEX,
        ref: HEX,
        text: "Move refused: equipped_cant_be_wrapped.",
      },
    ]);
  });
});
