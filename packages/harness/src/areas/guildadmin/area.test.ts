import { describe, expect, test } from "bun:test";
import type { AreaEvent, AreaState } from "@peon/core";
import { guildadminHarness } from "#harness/areas/guildadmin/area";
import { areaDrafts, areaRuleSet, attachDrafts } from "#harness/areas/rules";
import { createMockGame } from "#test-support/mock-game";
import { testRuleInput } from "#test-support/rule-fixtures";

const INFO: AreaState<"guildadmin"> = {
  disbanded: false,
  emblem: undefined,
  eventLog: undefined,
  permissions: undefined,
  roster: undefined,
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
    const drafts = areaDrafts(
      areaRuleSet(),
      guildadminEvent("disbanded"),
      testRuleInput(),
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      class: "wake",
      data: { disbanded: true },
      domain: "guildadmin",
      event: "guildadmin/disbanded",
    });
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

  test("the tabard designer opening writes a log row", () => {
    const drafts = areaDrafts(
      areaRuleSet(),
      { area: "guildadmin", event: { type: "tabard_vendor", npc: 7n } },
      testRuleInput(),
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      class: "log",
      event: "guildadmin/tabard_vendor",
    });
  });

  test("an emblem result writes a log row with its code", () => {
    const drafts = areaDrafts(
      areaRuleSet(),
      { area: "guildadmin", event: { type: "emblem_result", code: 2 } },
      testRuleInput(),
    );
    expect(drafts[0]).toMatchObject({
      data: { code: 2 },
      event: "guildadmin/emblem_result",
    });
  });

  test("the world acts are the guildadmin acts", () => {
    expect(guildadminHarness.worldActs).toContain("openTabardVendor");
    expect(guildadminHarness.worldActs).toContain("setInfoText");
    expect(guildadminHarness.worldActs).toHaveLength(11);
  });
});
