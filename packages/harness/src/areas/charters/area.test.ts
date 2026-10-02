import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { chartersHarness } from "#harness/areas/charters/area";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

const NPC = 0xf1_30_00_00_00_00_1e_b4n;
const ITEM = 0x40_00_00_00_00_00_00_31n;

function charters(event: unknown): AreaEvent {
  return { area: "charters", event } as unknown as AreaEvent;
}

describe("charters harness rules", () => {
  test("it exposes the charter acts to the world", () => {
    expect(chartersHarness.worldActs).toEqual([
      "showList",
      "buy",
      "query",
      "showSignatures",
      "rename",
    ]);
  });

  test("a showlist writes one log row with the price and signatures needed", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      charters({
        entries: [
          {
            cost: 1000,
            displayId: 16_161,
            entry: 5863,
            index: 1,
            required: 9,
            unknown: 0,
          },
        ],
        npc: NPC,
        type: "showlist",
      }),
      testRuleInput(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "log",
      domain: "charters",
      event: "charters/showlist",
    });
    expect(rows[0]?.text).toContain("1000");
    expect(rows[0]?.text).toContain("9");
  });

  test("a charter query writes no rows", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      charters({
        item: ITEM,
        petition: {
          id: 7,
          item: ITEM,
          kind: "guild",
          maxSigns: 9,
          name: "FacName",
          needed: 9,
          owner: 1n,
          signers: [],
        },
        type: "query",
      }),
      testRuleInput(),
    );
    expect(rows).toEqual([]);
  });
});
