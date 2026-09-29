import { describe, expect, test } from "bun:test";
import type { AreaEventOf } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

type RaidEvent = AreaEventOf<"raid">;

function rows(event: RaidEvent) {
  return areaDrafts(areaRuleSet(), { area: "raid", event }, testRuleInput());
}

const GROUP = {
  battleground: false,
  counter: 1,
  difficulty: undefined,
  dungeonFinder: undefined,
  kind: "party",
  leader: 0x10n,
  loot: undefined,
  members: [],
  self: { flags: 0, roles: 0, subgroup: 0 },
} as const;

describe("raid harness rules", () => {
  test("a conversion writes one passive roster row", () => {
    expect(
      rows({
        changes: [{ kind: "converted" }],
        group: GROUP,
        type: "group_list",
      }),
    ).toMatchObject([{ class: "passive", event: "raid/roster" }]);
  });

  test("joined and left changes write no rows", () => {
    expect(
      rows({
        changes: [{ kind: "joined", name: "Tom" }],
        group: GROUP,
        type: "group_list",
      }),
    ).toEqual([]);
    expect(
      rows({
        changes: [{ kind: "left", name: "Tom" }],
        group: GROUP,
        type: "group_list",
      }),
    ).toEqual([]);
  });

  test("a blocked invite writes one log row", () => {
    expect(rows({ name: "Tom", type: "invite_blocked" })).toMatchObject([
      { class: "log", event: "raid/invite_blocked" },
    ]);
  });
});
