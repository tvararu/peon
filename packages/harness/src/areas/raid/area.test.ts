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
  groupGuid: 0x1f4n,
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

  test("joined changes write no rows", () => {
    expect(
      rows({
        changes: [{ kind: "joined", name: "Tom" }],
        group: GROUP,
        type: "group_list",
      }),
    ).toEqual([]);
  });

  test("a left change writes one passive roster row", () => {
    expect(
      rows({
        changes: [{ kind: "left", name: "Tom" }],
        group: GROUP,
        type: "group_list",
      }),
    ).toMatchObject([
      { class: "passive", event: "raid/roster", text: "Tom left the group." },
    ]);
  });

  test("a change to the receiving character writes a roster row", () => {
    expect(
      rows({
        changes: [{ kind: "leader", self: true }],
        group: GROUP,
        type: "group_list",
      }),
    ).toMatchObject([
      { class: "passive", data: { change: "leader" }, event: "raid/roster" },
    ]);
  });

  test("a disband event writes one passive roster row", () => {
    expect(rows({ type: "disbanded" })).toMatchObject([
      { class: "passive", event: "raid/roster" },
    ]);
  });

  test("a blocked invite writes one log row", () => {
    expect(rows({ name: "Tom", type: "invite_blocked" })).toMatchObject([
      { class: "log", event: "raid/invite_blocked" },
    ]);
  });

  test("a command result writes one wake row", () => {
    expect(
      rows({
        member: "Nobody",
        operation: "swap",
        result: "group_swap_failed",
        type: "command_result",
      }),
    ).toMatchObject([{ class: "wake", event: "raid/command" }]);
  });

  test("a death writes one passive member row", () => {
    expect(
      rows({
        guid: 0x10n,
        name: "Tom",
        transitions: ["died"],
        type: "member_stats",
      }),
    ).toMatchObject([
      { class: "passive", event: "raid/member", text: "Tom died." },
    ]);
  });

  test("stats with no transition write no rows", () => {
    expect(
      rows({ guid: 0x10n, name: "Tom", transitions: [], type: "member_stats" }),
    ).toEqual([]);
  });
});

describe("raid roster row detail", () => {
  test("a flag gained names the flag and carries it", () => {
    const [row] = rows({
      changes: [{ flag: "main_tank", kind: "flag", name: "Tom", on: true }],
      group: GROUP,
      type: "group_list",
    });
    expect(row?.text).toContain("Tom");
    expect(row?.text).toContain("main tank");
    expect(row?.text).toContain("gained");
    expect(row?.data).toMatchObject({ flag: "main_tank", on: true });
  });

  test("a flag removal says lost, not gained", () => {
    const [row] = rows({
      changes: [{ flag: "assistant", kind: "flag", on: false, self: true }],
      group: GROUP,
      type: "group_list",
    });
    expect(row?.text).toContain("lost");
    expect(row?.text).toContain("assistant");
    expect(row?.text).not.toContain("gained");
    expect(row?.data).toMatchObject({ flag: "assistant", on: false });
  });

  test("a subgroup move carries and names the destination group", () => {
    const [row] = rows({
      changes: [{ from: 0, kind: "subgroup", name: "Tom", to: 2 }],
      group: GROUP,
      type: "group_list",
    });
    expect(row?.text).toContain("group 3");
    expect(row?.data).toMatchObject({ from: 0, to: 2 });
  });
});

describe("ready check harness rules", () => {
  test("a started check writes one wake row", () => {
    expect(
      rows({ initiator: 0x10n, name: "Tom", type: "ready_check_started" }),
    ).toMatchObject([{ class: "wake", event: "raid/ready_check" }]);
  });

  test("a check the agent starts names the agent", () => {
    const [row] = rows({
      initiator: 0x10n,
      name: "",
      type: "ready_check_started",
    });
    expect(row).toMatchObject({ class: "wake", event: "raid/ready_check" });
    expect(row?.text).toContain("You start");
  });

  test("an answer writes one passive row carrying the answer", () => {
    const [row] = rows({
      answer: "not_ready",
      guid: 0x10n,
      name: "Tom",
      type: "ready_check_answer",
    });
    expect(row).toMatchObject({
      class: "passive",
      data: { answer: "not_ready", name: "Tom" },
      event: "raid/ready_answer",
    });
    expect(row?.text).toContain("Tom");
    expect(row?.text).toContain("not ready");
  });

  test("a finished check reports counts and the names not ready", () => {
    const [row] = rows({
      notReady: ["Tom"],
      offline: 1,
      pending: 0,
      ready: 1,
      type: "ready_check_finished",
    });
    expect(row).toMatchObject({
      class: "passive",
      data: { notReady: ["Tom"], offline: 1, pending: 0, ready: 1 },
      event: "raid/ready_done",
    });
    expect(row?.text).toContain("Tom");
  });
});
