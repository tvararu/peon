import { describe, expect, test } from "bun:test";
import type { AreaEventOf } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

function battlegrounds(event: AreaEventOf<"battlegrounds">) {
  return { area: "battlegrounds" as const, event };
}

describe("battlegrounds harness rules", () => {
  test("pvp_flag writes one battlegrounds/flag log row", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      battlegrounds({
        contested: false,
        ffa: false,
        flagged: true,
        sanctuary: false,
        timer: false,
        type: "pvp_flag",
        wants: true,
      }),
      testRuleInput({}),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "log",
      data: { flagged: true, timer: false, wants: true },
      domain: "battlegrounds",
      event: "battlegrounds/flag",
    });
    expect(rows[0]?.text).toContain("is on");
  });

  test("honor_credit writes one battlegrounds/honor log row", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      battlegrounds({
        honor: 100,
        rank: 2,
        type: "honor_credit",
        victim: 0n,
      }),
      testRuleInput({}),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "log",
      data: { honor: 100, rank: 2 },
      domain: "battlegrounds",
      event: "battlegrounds/honor",
    });
    expect(rows[0]?.text).toContain("Earned 100 honor");
  });

  test("zone_under_attack is always passive in wave 5 (no area id in RuleInput)", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      battlegrounds({
        areaId: 42,
        at: 0,
        here: false,
        type: "zone_under_attack",
      }),
      testRuleInput({}),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "passive",
      data: { areaId: 42 },
      domain: "battlegrounds",
      event: "battlegrounds/zone_attack",
    });
    expect(rows[0]?.text).toContain("under attack");
    expect(rows[0]?.text).toContain("42");
  });

  test("honor_inspect and pvp_kill_quest write log rows", () => {
    const inspectRows = areaDrafts(
      areaRuleSet(),
      battlegrounds({
        guid: 11n,
        honor: 12,
        kills: 3,
        lifetime: 44,
        today: 7,
        type: "honor_inspect",
        yesterday: 9,
      }),
      testRuleInput({}),
    );
    expect(inspectRows.map((row) => row.event)).toEqual([
      "battlegrounds/inspect",
    ]);
    const questRows = areaDrafts(
      areaRuleSet(),
      battlegrounds({
        count: 2,
        quest: 13_233,
        required: 15,
        type: "pvp_kill_quest",
      }),
      testRuleInput({}),
    );
    expect(questRows.map((row) => row.event)).toEqual(["battlegrounds/kill"]);
  });

  const queued = {
    arenaType: 0,
    avgWaitMs: 61_000,
    bgType: 2,
    inQueueMs: 0,
    instanceId: 0,
    isArena: 0,
    kind: "queued" as const,
    maxLevel: 19,
    minLevel: 10,
    rated: false,
    receivedAt: 0,
    word: 0x1f_90,
  };

  test("bg_status queued writes battlegrounds/queued once and a refresh writes nothing", () => {
    const first = areaDrafts(
      areaRuleSet(),
      battlegrounds({
        previous: "none",
        slot: 0,
        status: queued,
        type: "bg_status",
      }),
      testRuleInput({}),
    );
    expect(first.map((row) => [row.event, row.class])).toEqual([
      ["battlegrounds/queued", "log"],
    ]);
    const refresh = areaDrafts(
      areaRuleSet(),
      battlegrounds({
        previous: "queued",
        slot: 0,
        status: queued,
        type: "bg_status",
      }),
      testRuleInput({}),
    );
    expect(refresh).toEqual([]);
  });

  test("bg_left after queued writes queue_left and after active writes nothing", () => {
    const left = (previous: "queued" | "active") =>
      areaDrafts(
        areaRuleSet(),
        battlegrounds({ bgType: 2, previous, slot: 1, type: "bg_left" }),
        testRuleInput({}),
      );
    expect(left("queued").map((row) => row.event)).toEqual([
      "battlegrounds/queue_left",
    ]);
    expect(left("active")).toEqual([]);
  });

  test("bg_invited wakes with the deadline in data", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      battlegrounds({
        bgType: 2,
        expiresAt: 90_000,
        mapId: 489,
        slot: 0,
        type: "bg_invited",
      }),
      testRuleInput({}),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "wake",
      data: { expiresAt: 90_000, mapId: 489, slot: 0 },
      event: "battlegrounds/invited",
    });
  });

  test("bg_entered and bg_left_match write entered and left log rows", () => {
    const entered = areaDrafts(
      areaRuleSet(),
      battlegrounds({ bgType: 2, mapId: 489, type: "bg_entered" }),
      testRuleInput({}),
    );
    expect(entered.map((row) => [row.event, row.class])).toEqual([
      ["battlegrounds/entered", "log"],
    ]);
    const left = areaDrafts(
      areaRuleSet(),
      battlegrounds({ mapId: 489, type: "bg_left_match" }),
      testRuleInput({}),
    );
    expect(left.map((row) => [row.event, row.class])).toEqual([
      ["battlegrounds/left", "log"],
    ]);
  });

  test("bg_player_joined and bg_player_left write passive rows", () => {
    const joined = areaDrafts(
      areaRuleSet(),
      battlegrounds({ guid: 0xaaaan, type: "bg_player_joined" }),
      testRuleInput({}),
    );
    expect(joined.map((row) => [row.event, row.class])).toEqual([
      ["battlegrounds/joined", "passive"],
    ]);
  });

  test("bg_score with ended writes ended as a wake, else a log row", () => {
    const live = (ended: boolean) =>
      areaDrafts(
        areaRuleSet(),
        battlegrounds({
          score: { arena: false, ended, players: [], teams: [], winner: 1 },
          type: "bg_score",
        }),
        testRuleInput({}),
      );
    expect(live(true).map((row) => [row.event, row.class])).toEqual([
      ["battlegrounds/score", "wake"],
      ["battlegrounds/ended", "wake"],
    ]);
    expect(live(false).map((row) => [row.event, row.class])).toEqual([
      ["battlegrounds/score", "log"],
    ]);
  });

  test("bg_rez_time writes a passive rez_time row", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      battlegrounds({
        guide: 0xaaaan,
        ms: 29_500,
        nextAt: 29_500,
        type: "bg_rez_time",
      }),
      testRuleInput({}),
    );
    expect(rows.map((row) => [row.event, row.class])).toEqual([
      ["battlegrounds/rez_time", "passive"],
    ]);
  });

  test("bg_join_result writes join_failed for an error and nothing for success; bg_list writes nothing", () => {
    const result = (error: string | undefined, code: number) =>
      areaDrafts(
        areaRuleSet(),
        battlegrounds({
          error,
          guid: undefined,
          result: code,
          type: "bg_join_result",
        }),
        testRuleInput({}),
      );
    expect(result("deserter", -2).map((row) => row.event)).toEqual([
      "battlegrounds/join_failed",
    ]);
    expect(result(undefined, 2)).toEqual([]);
    expect(
      areaDrafts(
        areaRuleSet(),
        battlegrounds({
          bgType: 2,
          fromWhere: 0,
          guid: 0n,
          instances: [],
          random: undefined,
          rewards: { hasWin: false, lossHonor: 0, winArena: 0, winHonor: 0 },
          type: "bg_list",
        }),
        testRuleInput({}),
      ),
    ).toEqual([]);
  });
});
