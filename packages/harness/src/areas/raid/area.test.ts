import { describe, expect, test } from "bun:test";
import type { AreaEventOf } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { createRuleMemo } from "#harness/events/rules";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

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
      {
        class: "passive",
        data: { change: "left", name: "Tom" },
        event: "raid/roster",
      },
    ]);
  });

  test("becoming leader writes a wake roster row", () => {
    expect(
      rows({
        changes: [{ kind: "leader", self: true }],
        group: GROUP,
        type: "group_list",
      }),
    ).toMatchObject([
      { class: "wake", data: { change: "leader" }, event: "raid/roster" },
    ]);
  });

  test("another member becoming leader stays passive", () => {
    expect(
      rows({
        changes: [{ kind: "leader", name: "Ann" }],
        group: GROUP,
        type: "group_list",
      }),
    ).toMatchObject([
      { class: "passive", data: { change: "leader" }, event: "raid/roster" },
    ]);
  });

  test("other changes to the receiving character stay passive", () => {
    expect(
      rows({
        changes: [{ flag: "assistant", kind: "flag", on: true }],
        group: GROUP,
        type: "group_list",
      }),
    ).toMatchObject([{ class: "passive", event: "raid/roster" }]);
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
      {
        class: "passive",
        data: { name: "Tom", transition: "died" },
        event: "raid/member",
      },
    ]);
  });

  test("stats with no transition write no rows", () => {
    expect(
      rows({ guid: 0x10n, name: "Tom", transitions: [], type: "member_stats" }),
    ).toEqual([]);
  });
});

describe("raid roster row detail", () => {
  test("a flag gained carries the flag and that it is on", () => {
    const [row] = rows({
      changes: [{ flag: "main_tank", kind: "flag", name: "Tom", on: true }],
      group: GROUP,
      type: "group_list",
    });
    expect(row?.data).toMatchObject({ flag: "main_tank", on: true });
  });

  test("a flag removal carries the flag and that it is off", () => {
    const [row] = rows({
      changes: [{ flag: "assistant", kind: "flag", on: false, self: true }],
      group: GROUP,
      type: "group_list",
    });
    expect(row?.data).toMatchObject({ flag: "assistant", on: false });
  });

  test("a subgroup move carries the source and destination group", () => {
    const [row] = rows({
      changes: [{ from: 0, kind: "subgroup", name: "Tom", to: 2 }],
      group: GROUP,
      type: "group_list",
    });
    expect(row?.data).toMatchObject({ from: 0, to: 2 });
  });
});

describe("ready check harness rules", () => {
  test("a started check writes one wake row", () => {
    expect(
      rows({ initiator: 0x10n, name: "Tom", type: "ready_check_started" }),
    ).toMatchObject([{ class: "wake", event: "raid/ready_check" }]);
  });

  test("a check the agent starts carries an empty name", () => {
    const [row] = rows({
      initiator: 0x10n,
      name: "",
      type: "ready_check_started",
    });
    expect(row).toMatchObject({ class: "wake", event: "raid/ready_check" });
    expect(row?.data).toMatchObject({ name: "" });
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
  });
});

function rowsWith(event: RaidEvent, over: Parameters<typeof testRuleInput>[0]) {
  return areaDrafts(
    areaRuleSet(),
    { area: "raid", event },
    testRuleInput(over),
  );
}

const LYNX = 0xf130000123000045n;

describe("raid mark harness rules", () => {
  test("a set by a named member writes one passive mark row", () => {
    const [row, ...rest] = rowsWith(
      { icon: 7, name: "Tom", target: LYNX, type: "raid_mark", who: 0x10n },
      { lookup: testLookup({ unitName: () => "Springpaw Lynx" }) },
    );
    expect(rest).toEqual([]);
    expect(row).toMatchObject({
      class: "passive",
      data: { icon: 7, name: "Tom", target: `${LYNX}` },
      event: "raid/mark",
    });
  });

  test("a set by the agent carries the agent name and icon", () => {
    const [row] = rowsWith(
      { icon: 0, name: "", target: LYNX, type: "raid_mark", who: 1n },
      { selfGuid: 1n, selfName: "Fgk" },
    );
    expect(row).toMatchObject({ event: "raid/mark" });
    expect(row?.data).toMatchObject({ icon: 0, name: "Fgk" });
  });

  test("an explicit clear by a named member writes a mark row", () => {
    const [row] = rows({
      icon: 7,
      name: "Tom",
      target: 0n,
      type: "raid_mark",
      who: 0x10n,
    });
    expect(row).toMatchObject({
      class: "passive",
      data: { icon: 7, name: "Tom" },
      event: "raid/mark",
    });
  });

  test("the server's own clear before a move writes no row", () => {
    expect(
      rows({ icon: 7, name: "", target: 0n, type: "raid_mark", who: 0n }),
    ).toEqual([]);
  });

  test("a mark list writes no row", () => {
    expect(
      rows({ marks: [LYNX, 0n, 0n, 0n, 0n, 0n, 0n, 0n], type: "raid_marks" }),
    ).toEqual([]);
  });
});

describe("minimap ping harness rules", () => {
  const ping = {
    name: "Tom",
    type: "minimap_ping",
    who: 0x10n,
    x: 130,
    y: 40,
  } as const;

  test("a ping writes one passive row carrying the position", () => {
    const memo = createRuleMemo();
    memo.pose = { mapId: 0, x: 100, y: 40, z: 0 };
    const [row, ...rest] = rowsWith(ping, { memo });
    expect(rest).toEqual([]);
    expect(row).toMatchObject({
      class: "passive",
      data: { name: "Tom", x: 130, y: 40 },
      event: "raid/ping",
    });
  });

  test("a ping before any pose is known still writes a row", () => {
    const [row] = rows(ping);
    expect(row).toMatchObject({ class: "passive", event: "raid/ping" });
    expect(row?.data).toMatchObject({ name: "Tom", x: 130, y: 40 });
  });
});

describe("summon harness rules", () => {
  const base = {
    expiresAt: 121_000,
    summoner: 0x10n,
    timeoutMs: 120_000,
    type: "summon_requested",
    zoneId: 3430,
  } as const;

  test("a request writes one wake row naming summoner, zone and seconds", () => {
    const out = rows({ ...base, name: "Tom", zoneName: "Eversong Woods" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      class: "wake",
      data: { seconds: 120, summoner: "16", zone: "Eversong Woods" },
      event: "raid/summon",
    });
  });

  test("without a zone name the row carries the zone id", () => {
    const [row] = rows({ ...base, name: "Tom", zoneName: undefined });
    expect(row?.data).toMatchObject({ zone: "zone 3430" });
  });

  test("an unnamed summoner falls back to the lookup, then to Someone", () => {
    const named = areaDrafts(
      areaRuleSet(),
      {
        area: "raid",
        event: { ...base, name: "", zoneName: undefined },
      },
      testRuleInput({ lookup: testLookup({ unitName: () => "Ann" }) }),
    );
    expect(named[0]?.data).toMatchObject({ name: "Ann" });
    const [anon] = rows({ ...base, name: "", zoneName: undefined });
    expect(anon?.data).toMatchObject({ name: "Someone" });
  });

  test("an expiry writes one passive row", () => {
    expect(
      rows({ name: "Tom", summoner: 0x10n, type: "summon_expired" }),
    ).toMatchObject([{ class: "passive", event: "raid/summon_expired" }]);
  });
});
