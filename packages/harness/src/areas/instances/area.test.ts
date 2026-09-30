import { describe, expect, test } from "bun:test";
import type { AreaEventOf } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

type InstancesEvent = AreaEventOf<"instances">;

function rows(event: InstancesEvent) {
  return areaDrafts(
    areaRuleSet(),
    { area: "instances", event },
    testRuleInput(),
  );
}

const WARNING = {
  difficulty: 1,
  extended: undefined,
  locked: undefined,
  mapId: 533,
  type: "warning",
} as const;

describe("instances harness rules", () => {
  test("map_difficulty above normal writes one log row and normal writes none", () => {
    const base = {
      dynamicHeroic: false,
      mapId: 574,
      type: "map_difficulty",
    } as const;
    expect(rows({ ...base, difficulty: 1, name: "heroic" })).toMatchObject([
      {
        class: "log",
        data: { difficulty: 1, mapId: 574 },
        domain: "instances",
        event: "instances/map_difficulty",
      },
    ]);
    expect(rows({ ...base, difficulty: 1, name: "heroic" })[0]?.text).toContain(
      "heroic",
    );
    expect(rows({ ...base, difficulty: 0, name: "normal" })).toEqual([]);
  });

  test("the login difficulty writes nothing and a later change writes one log row", () => {
    const base = {
      difficulty: 1,
      inGroup: false,
      kind: "dungeon",
      name: "heroic",
      type: "difficulty",
    } as const;
    expect(rows({ ...base, previous: undefined })).toEqual([]);
    expect(rows({ ...base, previous: 0 })).toMatchObject([
      {
        class: "log",
        data: { difficulty: 1, kind: "dungeon", previous: 0 },
        event: "instances/difficulty",
      },
    ]);
  });

  test("each warning kind writes one wake row with the map and the time left", () => {
    for (const [kind, secondsLeft] of [
      [1, 7200],
      [2, 600],
      [3, 240],
      [4, 86_400],
      [5, 0],
    ] as const) {
      const drafts = rows({ ...WARNING, kind, secondsLeft });
      expect(drafts).toMatchObject([
        {
          class: "wake",
          data: { kind, mapId: 533, secondsLeft },
          event: "instances/warning",
        },
      ]);
      expect(drafts[0]?.text).toContain("533");
    }
  });

  test("a started homebind timer wakes with its seconds and a cancelled one only logs", () => {
    const started = rows({
      code: 1,
      ms: 60_000,
      state: "started",
      type: "homebind_timer",
    });
    expect(started).toMatchObject([
      {
        class: "wake",
        data: { ms: 60_000, state: "started" },
        event: "instances/homebind_timer",
      },
    ]);
    expect(started[0]?.text).toContain("60 s");
    expect(
      rows({ code: 0, ms: 0, state: "cancelled", type: "homebind_timer" }),
    ).toMatchObject([
      {
        class: "log",
        data: { state: "cancelled" },
        event: "instances/homebind_timer",
      },
    ]);
  });

  test("corpse_elsewhere writes one wake row", () => {
    expect(rows({ type: "corpse_elsewhere" })).toMatchObject([
      { class: "wake", event: "instances/corpse_elsewhere" },
    ]);
  });

  test("reset logs the map so the reset is observable", () => {
    const [row, ...rest] = rows({ mapId: 36, type: "reset" });
    expect(rest).toEqual([]);
    expect(row).toMatchObject({
      class: "log",
      data: { mapId: 36 },
      event: "instances/reset",
      progress: true,
    });
    expect(row?.text).toContain("36");
  });

  test("reset_failed wakes with the map and names each failure reason", () => {
    const texts = [0, 1, 2].map((reason) => {
      const [row, ...rest] = rows({ mapId: 36, reason, type: "reset_failed" });
      expect(rest).toEqual([]);
      expect(row).toMatchObject({
        class: "wake",
        data: { mapId: 36, reason },
        event: "instances/reset_failed",
      });
      return row?.text ?? "";
    });
    for (const text of texts) expect(text).toContain("36");
    expect(new Set(texts).size).toBe(3);
  });

  test("reset_blocked wakes with the map", () => {
    const [row, ...rest] = rows({ mapId: 36, type: "reset_blocked" });
    expect(rest).toEqual([]);
    expect(row).toMatchObject({
      class: "wake",
      data: { mapId: 36 },
      event: "instances/reset_blocked",
    });
    expect(row?.text).toContain("36");
  });

  test("bind_offer wakes with the choice window and the bind call", () => {
    const [row, ...rest] = rows({
      deadline: 1_000_000,
      encounterMask: 3,
      timeoutMs: 60_000,
      type: "bind_offer",
    });
    expect(rest).toEqual([]);
    expect(row).toMatchObject({
      class: "wake",
      data: { encounterMask: 3, timeoutMs: 60_000 },
      event: "instances/bind_offer",
    });
    expect(row?.text).toContain("60 s");
    expect(row?.text).toContain("bind");
  });

  test("bound writes one passive row", () => {
    expect(rows({ type: "bound" })).toMatchObject([
      { class: "passive", event: "instances/bound" },
    ]);
  });

  test("lockouts log the maps added and removed and stay quiet when nothing changed", () => {
    const lock = {
      difficulty: 1,
      extended: false,
      instanceGuid: 9n,
      locked: true,
      mapId: 533,
      secondsToReset: 3600,
    };
    const changed = rows({
      added: [lock],
      locks: [lock],
      removed: [],
      type: "lockouts",
    });
    expect(changed).toMatchObject([
      { class: "log", data: { added: [533], removed: [] } },
    ]);
    expect(changed[0]?.event).toBe("instances/lockouts");
    expect(changed[0]?.text).toContain("533");
    expect(
      rows({ added: [], locks: [lock], removed: [], type: "lockouts" }),
    ).toEqual([]);
    expect(
      rows({ added: [], locks: [], removed: [lock], type: "lockouts" }),
    ).toMatchObject([{ data: { added: [], removed: [533] } }]);
  });
  test("saved_maps writes nothing", () => {
    expect(
      rows({ hasPermanentBinds: true, maps: [533], type: "saved_maps" }),
    ).toEqual([]);
  });

  test("encounter writes nothing", () => {
    expect(
      rows({
        change: "engage",
        guid: 0x00f1_2299_0000_0003n,
        priority: 7,
        type: "encounter",
      }),
    ).toEqual([]);
  });
});
