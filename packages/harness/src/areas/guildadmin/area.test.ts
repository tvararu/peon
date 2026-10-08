import { describe, expect, test } from "bun:test";
import type { AreaEvent, AreaState } from "@peon/core";
import { areaDrafts, areaRuleSet, attachDrafts } from "#harness/areas/rules";
import { createMockGame } from "#test-support/mock-game";
import { testRuleInput } from "#test-support/rule-fixtures";

const INFO: AreaState<"guildadmin"> = {
  disbanded: false,
  emblem: undefined,
  eventLog: undefined,
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
  permissions: undefined,
  roster: undefined,
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
      { area: "guildadmin", event: { npc: 7n, type: "tabard_vendor" } },
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
      { area: "guildadmin", event: { code: 2, type: "emblem_result" } },
      testRuleInput(),
    );
    expect(drafts[0]).toMatchObject({
      data: { code: 2 },
      event: "guildadmin/emblem_result",
    });
  });
});
