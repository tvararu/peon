import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { namedByHuman, noteHuman } from "#harness/events/dealings";
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

const NAMES: Record<number, string> = { 117: "Tough Jerky", 2589: "Linen" };

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

  test("a requested trade says whether the human named the requester", () => {
    const named = input();
    noteHuman(named.dealings, "Wait for Unit9 and take their water.");
    const [hit] = areaDrafts(
      areaRuleSet(),
      trade({ from: 9n, type: "requested" }),
      named,
    );
    expect(hit?.text).toContain("Unit9");
    const other = input();
    noteHuman(other.dealings, "Wait for Unit10 and take their water.");
    const [miss] = areaDrafts(
      areaRuleSet(),
      trade({ from: 9n, type: "requested" }),
      other,
    );
    expect(miss?.text).toContain("Unit9");
    expect(miss?.text).toContain("Unit9");
    expect(miss?.text).not.toBe(hit?.text);
  });

  test("a requester whose name is unresolved gets no standing note", () => {
    const unresolved = testRuleInput({
      lookup: testLookup({ unitName: () => undefined }),
    });
    noteHuman(unresolved.dealings, "Trade with Bob at the gate.");
    const [row] = areaDrafts(
      areaRuleSet(),
      trade({ from: 9n, type: "requested" }),
      unresolved,
    );
    expect(row?.text).toBe("player 9 wants to trade with you.");
  });

  test("human names match whole Unicode names", () => {
    const rc = testRuleInput({
      lookup: testLookup({ unitName: () => "Éowyn" }),
    });
    noteHuman(rc.dealings, "Trade with Éowynn at the gate.");
    const [row] = areaDrafts(
      areaRuleSet(),
      trade({ from: 9n, type: "requested" }),
      rc,
    );
    expect(namedByHuman(rc.dealings, "Éowyn")).toBe(false);
    expect(row?.text).toContain("Éowyn");
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

  test("a completed row omits the non-traded service slot", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      trade({
        gave: EMPTY,
        got: {
          ...EMPTY,
          items: [
            { count: 20, entry: 117, slot: 5 },
            { count: 1, entry: 2589, slot: 6 },
          ],
        },
        type: "completed",
      }),
      testRuleInput({
        lookup: testLookup({
          itemName: (entry) => NAMES[entry],
        }),
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toContain("Tough Jerky");
    expect(rows[0]?.text).not.toContain("Linen");
  });

  test("back_to_trade writes no row", () => {
    expect(
      areaDrafts(areaRuleSet(), trade({ type: "back_to_trade" }), input()),
    ).toEqual([]);
  });
});
