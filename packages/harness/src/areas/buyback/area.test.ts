import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

const SOLD = {
  count: 1,
  entry: 2589,
  guid: 0x77n,
  price: 35,
  slot: 74,
  soldAt: 10,
};

function buyback(event: unknown): AreaEvent {
  return { area: "buyback", event } as unknown as AreaEvent;
}

function input() {
  return testRuleInput({
    lookup: testLookup({
      itemName: (id) => (id === 2589 ? "Linen Cloth" : undefined),
    }),
  });
}

describe("buyback harness rules", () => {
  test("a bought back item writes one log row naming the item and price", () => {
    const rules = areaRuleSet();
    const rc = input();
    expect(
      areaDrafts(rules, buyback({ list: [SOLD], type: "listed" }), rc),
    ).toEqual([]);
    const rows = areaDrafts(
      rules,
      buyback({ entry: 2589, guid: 0x77n, slot: 74, type: "bought_back" }),
      rc,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "log",
      domain: "buyback",
      event: "buyback/bought_back",
    });
    expect(rows[0]?.text).toContain("Linen Cloth");
    expect(rows[0]?.text).toContain("35 copper");
  });

  test("a bought back item with no remembered price names only the item", () => {
    const [row] = areaDrafts(
      areaRuleSet(),
      buyback({ entry: 2589, guid: 0x99n, slot: 74, type: "bought_back" }),
      input(),
    );
    expect(row?.text).toContain("Linen Cloth");
    expect(row?.text).not.toContain("copper");
  });

  test("a refused buyback writes one wake row with the reason", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      buyback({ kind: "buyback", reason: "cant_find_item", type: "refused" }),
      input(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "wake",
      event: "buyback/refused",
    });
    expect(rows[0]?.text).toContain("cant_find_item");
  });

  test("an unanswered buyback writes one wake row", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      buyback({ kind: "buyback", type: "unanswered" }),
      input(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "wake",
      event: "buyback/unanswered",
    });
    expect(rows[0]?.text).toContain("went unanswered");
  });
});
