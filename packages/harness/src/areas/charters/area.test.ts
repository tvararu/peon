import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

const NPC = 0xf1_30_00_00_00_00_1e_b4n;
const ITEM = 0x40_00_00_00_00_00_00_31n;

function charters(event: unknown): AreaEvent {
  return { area: "charters", event } as unknown as AreaEvent;
}

describe("charters harness rules", () => {
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
    expect(rows[0]?.text).toContain("1000 copper");
    expect(rows[0]?.text).toContain("9 signatures");
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
  test("an offered charter writes one wake row", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      charters({ item: ITEM, offered: true, signers: [], type: "signatures" }),
      testRuleInput(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "wake",
      domain: "charters",
      event: "charters/offer",
    });
  });

  test("a sign result writes one passive row", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      charters({ item: ITEM, result: 0, signer: 2n, type: "sign_result" }),
      testRuleInput(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "passive",
      domain: "charters",
      event: "charters/signed",
    });
  });

  test("a turn-in writes a wake row unless it succeeded", () => {
    const refused = areaDrafts(
      areaRuleSet(),
      charters({ code: 4, type: "turn_in" }),
      testRuleInput(),
    );
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({
      class: "wake",
      event: "charters/turned_in",
    });
    const created = areaDrafts(
      areaRuleSet(),
      charters({ code: 0, type: "turn_in" }),
      testRuleInput(),
    );
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      class: "log",
      event: "charters/turned_in",
    });
  });
});
