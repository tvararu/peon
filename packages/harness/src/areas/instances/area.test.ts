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

  test("saved_maps writes nothing", () => {
    expect(
      rows({ hasPermanentBinds: true, maps: [533], type: "saved_maps" }),
    ).toEqual([]);
  });
});
