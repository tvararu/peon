import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

function bindPoint(reason: "login" | "bound"): AreaEvent {
  return {
    area: "travel",
    event: {
      areaId: 3665,
      mapId: 530,
      reason,
      type: "bind_point",
      x: 1,
      y: 2,
      z: 3,
    },
  } as unknown as AreaEvent;
}

function bindOffer(): AreaEvent {
  return {
    area: "travel",
    event: { npc: 0x1234n, type: "bind_offer" },
  } as unknown as AreaEvent;
}

function travelEvent(event: Record<string, unknown>): AreaEvent {
  return { area: "travel", event } as unknown as AreaEvent;
}

function falconwing() {
  return testRuleInput({
    lookup: testLookup({
      place: () => ({ area: "Falconwing Square", zone: "Eversong Woods" }),
    }),
  });
}

describe("travel harness rules", () => {
  test("a bound bind point writes one home_set row naming the area", () => {
    const [row] = areaDrafts(areaRuleSet(), bindPoint("bound"), falconwing());
    expect(row).toMatchObject({
      domain: "travel",
      event: "travel/home_set",
      progress: true,
    });
    expect(row?.text).toContain("Falconwing Square");
  });

  test("a login bind point writes no row", () => {
    expect(
      areaDrafts(areaRuleSet(), bindPoint("login"), testRuleInput()),
    ).toEqual([]);
  });

  test("a bind offer writes one bind_offer row", () => {
    const [row] = areaDrafts(areaRuleSet(), bindOffer(), testRuleInput());
    expect(row).toMatchObject({
      domain: "travel",
      event: "travel/bind_offer",
    });
  });

  test("a learned flight path writes a node_learned row naming the master", () => {
    const rc = testRuleInput({
      lookup: testLookup({ unitName: () => "Dragonhawk Master" }),
    });
    const [row] = areaDrafts(
      areaRuleSet(),
      travelEvent({ npc: 0x55n, type: "taxi_node_learned" }),
      rc,
    );
    expect(row).toMatchObject({
      domain: "travel",
      event: "travel/node_learned",
    });
    expect(row?.text).toContain("Dragonhawk Master");
  });

  test("a learned flight path with no known master still writes a row", () => {
    const [row] = areaDrafts(
      areaRuleSet(),
      travelEvent({ npc: undefined, type: "taxi_node_learned" }),
      testRuleInput(),
    );
    expect(row).toMatchObject({ event: "travel/node_learned" });
    expect(row?.text).toContain("a new stop");
  });

  test("a started flight writes a flight_started row with the route, fare and duration", () => {
    const [row] = areaDrafts(
      areaRuleSet(),
      travelEvent({
        durationMs: 95_000,
        fare: 105,
        route: [83, 82],
        type: "flight_started",
      }),
      testRuleInput(),
    );
    expect(row).toMatchObject({
      data: { durationMs: 95_000, fare: 105, route: [83, 82] },
      event: "travel/flight_started",
      progress: true,
    });
    expect(row?.text).toContain("105");
    expect(row?.text).toContain("95 s");
    expect(row?.text).toContain("2 stops");
  });

  test("a learned flight path carries the node id in the row data", () => {
    const [row] = areaDrafts(
      areaRuleSet(),
      travelEvent({ node: 82, npc: 0x55n, type: "taxi_node_learned" }),
      testRuleInput(),
    );
    expect(row).toMatchObject({
      data: { node: 82 },
      event: "travel/node_learned",
    });
  });

  test("a landing writes a flight_landed wake row", () => {
    const [row] = areaDrafts(
      areaRuleSet(),
      travelEvent({ type: "flight_landed" }),
      testRuleInput(),
    );
    expect(row).toMatchObject({
      class: "wake",
      event: "travel/flight_landed",
    });
  });

  test("a refused taxi reply writes a flight_refused row with the short name", () => {
    const [row] = areaDrafts(
      areaRuleSet(),
      travelEvent({ code: 3, name: "not_enough_money", type: "taxi_reply" }),
      testRuleInput(),
    );
    expect(row).toMatchObject({
      data: { code: 3, name: "not_enough_money" },
      event: "travel/flight_refused",
    });
    expect(row?.text).toContain("not_enough_money");
  });

  test("a named learned node writes node_learned naming the node from the catalog", () => {
    const [row] = areaDrafts(
      areaRuleSet(),
      travelEvent({
        name: "Tranquillien",
        node: 83,
        npc: 0x55n,
        type: "taxi_node_named",
      }),
      testRuleInput(),
    );
    expect(row).toMatchObject({
      data: { node: 83 },
      event: "travel/node_learned",
    });
    expect(row?.text).toContain("Tranquillien");
  });

  test("a named learned node without a catalog name falls back to the node id", () => {
    const [row] = areaDrafts(
      areaRuleSet(),
      travelEvent({
        name: undefined,
        node: 83,
        npc: 0x55n,
        type: "taxi_node_named",
      }),
      testRuleInput(),
    );
    expect(row).toMatchObject({ event: "travel/node_learned" });
    expect(row?.text).toContain("node 83");
  });

  test("an ok taxi reply writes no refusal row", () => {
    expect(
      areaDrafts(
        areaRuleSet(),
        travelEvent({ code: 0, name: "ok", type: "taxi_reply" }),
        testRuleInput(),
      ),
    ).toEqual([]);
  });
});
