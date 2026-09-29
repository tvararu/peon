import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { tradeHarness } from "#harness/areas/trade/area";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

function trade(event: unknown): AreaEvent {
  return { area: "trade", event } as unknown as AreaEvent;
}

function input() {
  return testRuleInput({
    lookup: testLookup({ unitName: (guid) => `Unit${guid}` }),
  });
}

const EMPTY = { gold: 0, items: [], spell: 0, version: 1 };

describe("trade harness rules", () => {
  test("a requested trade is a wake draft naming the player", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      trade({ from: 9n, type: "requested" }),
      input(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "wake",
      domain: "trade",
      event: "trade/requested",
    });
    expect(rows[0]?.text).toContain("Unit9");
  });

  test("opened and offer_changed write log rows", () => {
    const opened = areaDrafts(
      areaRuleSet(),
      trade({ type: "opened", with: 9n }),
      input(),
    );
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({
      class: "log",
      event: "trade/opened",
    });
    const changed = areaDrafts(
      areaRuleSet(),
      trade({ type: "offer_changed", version: 2 }),
      input(),
    );
    expect(changed).toMatchObject([
      { class: "log", event: "trade/offer_changed" },
    ]);
  });

  test("they_accepted, canceled and refused are wake rows; completed is a progress log row", () => {
    for (const event of [
      { type: "they_accepted" },
      { status: "trade_canceled", type: "canceled" },
      { status: "target_to_far", type: "refused" },
    ] as const) {
      const rows = areaDrafts(areaRuleSet(), trade(event), input());
      expect(rows).toHaveLength(1);
      expect(rows[0]?.class).toBe("wake");
    }
    const done = areaDrafts(
      areaRuleSet(),
      trade({ gave: EMPTY, got: EMPTY, type: "completed" }),
      input(),
    );
    expect(done).toMatchObject([
      {
        class: "log",
        event: "trade/completed",
        progress: true,
      },
    ]);
  });

  test("back_to_trade writes no row", () => {
    expect(
      areaDrafts(areaRuleSet(), trade({ type: "back_to_trade" }), input()),
    ).toEqual([]);
  });

  test("worldActs lists every trade act", () => {
    expect(tradeHarness.worldActs).toEqual([
      "acceptTrade",
      "answerTrade",
      "cancelTrade",
      "offerGold",
      "offerItem",
      "requestTrade",
      "unacceptTrade",
      "withdrawItem",
    ]);
  });
});
