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
      text: "Home is now Falconwing Square.",
    });
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
});
