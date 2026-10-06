import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

const CLOTH = 0x40_00_00_00_00_00_00_21n;
const BANKER = 0xf1_30_00_00_00_00_00_55n;

function bank(event: unknown): AreaEvent {
  return { area: "bank", event } as unknown as AreaEvent;
}

function input() {
  return testRuleInput({
    lookup: testLookup({
      itemName: (id) => (id === 2589 ? "Linen Cloth" : undefined),
    }),
  });
}

describe("bank harness rules", () => {
  test("an opened bank writes one log row saying the bank opened", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      bank({ banker: BANKER, type: "opened" }),
      input(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "log",
      domain: "bank",
      event: "bank/opened",
    });
    expect(rows[0]?.text).toContain("Opened the bank");
    expect(rows[0]?.data?.["banker"]).toBe("f130000000000055");
  });

  test("a deposit writes one log row naming the item", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      bank({
        count: 20,
        entry: 2589,
        guid: CLOTH,
        kind: "deposit",
        type: "moved",
      }),
      input(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "log",
      domain: "bank",
      event: "bank/deposit",
    });
    expect(rows[0]?.text).toContain("Linen Cloth");
  });

  test("a withdrawal writes one log row naming the item", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      bank({
        count: 20,
        entry: 2589,
        guid: CLOTH,
        kind: "withdraw",
        type: "moved",
      }),
      input(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "log",
      domain: "bank",
      event: "bank/withdraw",
    });
    expect(rows[0]?.text).toContain("Linen Cloth");
  });

  test("a deposit of an unknown entry names the item generically", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      bank({
        count: 1,
        entry: undefined,
        guid: CLOTH,
        kind: "deposit",
        type: "moved",
      }),
      input(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toContain("an item");
    expect(rows[0]?.data?.["guid"]).toBe("4000000000000021");
  });

  test("a bought slot writes one log row with the result", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      bank({ result: "ok", type: "slot_bought" }),
      input(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "log",
      domain: "bank",
      event: "bank/slot",
    });
    expect(rows[0]?.text).toContain("ok");
  });

  test("a refused move writes one wake row with the reason", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      bank({ kind: "deposit", reason: "cant_carry_more", type: "refused" }),
      input(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "wake",
      event: "bank/refused",
    });
    expect(rows[0]?.text).toContain("cant_carry_more");
  });

  test("a no-change move writes one wake row", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      bank({ kind: "withdraw", type: "no_change" }),
      input(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "wake",
      event: "bank/no_change",
    });
    expect(rows[0]?.text).toContain("changed nothing");
  });

  test("an unanswered move writes one wake row", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      bank({ kind: "slot", type: "unanswered" }),
      input(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "wake",
      event: "bank/unanswered",
    });
    expect(rows[0]?.text).toContain("went unanswered");
  });
});
