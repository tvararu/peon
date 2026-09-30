import { describe, expect, test } from "bun:test";
import type { AreaEvent, AreaEventOf } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

type CombatlogEvent = AreaEventOf<"combatlog">;

const ME = 0x2an;
const MATE = 0x2bn;
const TYPES = ["exhausted", "drowning", "fall", "lava", "slime", "fire"];

function rows(event: CombatlogEvent, runActive: boolean) {
  const rc = testRuleInput({ runActive, selfGuid: ME });
  return areaDrafts(
    areaRuleSet(),
    { area: "combatlog", event } as AreaEvent,
    rc,
  );
}

function environmental(over: Partial<CombatlogEvent> = {}): CombatlogEvent {
  return {
    amount: 120,
    at: 1000,
    extra: 2,
    kind: "environmental",
    source: 0n,
    target: ME,
    type: "entry",
    ...over,
  } as CombatlogEvent;
}

describe("combatlog environmental rule", () => {
  test("outside a run one wake row names the damage type and amount", () => {
    expect(rows(environmental(), false)).toEqual([
      expect.objectContaining({
        class: "wake",
        domain: "combatlog",
        event: "combatlog/environmental",
        text: "You took 120 fall damage.",
      }),
    ]);
  });

  test("inside a run the row is class log", () => {
    expect(rows(environmental(), true)).toEqual([
      expect.objectContaining({
        class: "log",
        event: "combatlog/environmental",
      }),
    ]);
  });

  test("wire types 0-5 name exhausted, drowning, fall, lava, slime and fire", () => {
    TYPES.forEach((name, type) => {
      const [row] = rows(environmental({ extra: type } as never), false);
      expect(row?.text).toContain(name);
      expect(row?.data).toMatchObject({ amount: 120, type: name });
    });
  });

  test("a type outside 0-5 still writes a row", () => {
    const [row] = rows(environmental({ extra: 9 } as never), false);
    expect(row?.text).toContain("120");
    expect(row?.data).toMatchObject({ type: "unknown_9" });
  });

  test("damage to another unit writes nothing", () => {
    expect(rows(environmental({ target: MATE }), false)).toEqual([]);
  });
});
