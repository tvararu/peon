import { describe, expect, test } from "bun:test";
import type { AreaEvent, AreaState } from "@peon/core";
import { guildadminHarness } from "#harness/areas/guildadmin/area";
import { areaDrafts, areaRuleSet, attachDrafts } from "#harness/areas/rules";
import { createMockGame } from "#test-support/mock-game";
import { testRuleInput } from "#test-support/rule-fixtures";

const INFO: AreaState<"guildadmin"> = {
  disbanded: false,
  info: {
    accounts: 1,
    created: {
      day: 2,
      hour: 15,
      minute: 16,
      month: 10,
      weekday: 5,
      year: 2026,
    },
    members: 1,
    name: "FacSeedAlpha",
  },
};

function guildadminEvent(type: "info" | "disbanded"): AreaEvent {
  return type === "info"
    ? {
        area: "guildadmin",
        event: {
          info: INFO.info as NonNullable<AreaState<"guildadmin">["info"]>,
          type,
        },
      }
    : { area: "guildadmin", event: { type } };
}

describe("guildadmin harness rules", () => {
  test("disbanded writes one wake row", () => {
    expect(
      areaDrafts(areaRuleSet(), guildadminEvent("disbanded"), testRuleInput()),
    ).toEqual([
      {
        class: "wake",
        data: { disbanded: true },
        domain: "guildadmin",
        event: "guildadmin/disbanded",
        text: "The guild is disbanded.",
      },
    ]);
  });

  test("an info event writes no row", () => {
    expect(
      areaDrafts(areaRuleSet(), guildadminEvent("info"), testRuleInput()),
    ).toEqual([]);
  });

  test("attach writes nothing", () => {
    const game = Object.assign(createMockGame(), {
      guildadmin: { ...createMockGame().guildadmin, state: () => INFO },
    });
    expect(attachDrafts(areaRuleSet(), game, testRuleInput())).toEqual([]);
  });

  test("the world acts are info and disband", () => {
    expect(guildadminHarness.worldActs).toEqual(["info", "disband"]);
  });
});
