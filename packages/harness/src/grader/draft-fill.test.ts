import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { scratchDir } from "@peon/core/test-support/scratch";
import { observedChecks, truthSummary } from "#harness/grader/draft-fill";
import type { ScenarioCheck } from "#harness/grader/scenarios";
import type { Truth } from "#harness/grader/truth";
import { totalXp } from "#harness/grader/xp-table";

const truth = (overrides: Partial<Truth> = {}): Truth => ({
  account: "FAC0123456789",
  alive: true,
  class: 5,
  deathState: "alive",
  guid: 1,
  health: 100,
  inventory: [
    {
      bag: 255,
      count: 20,
      item: 159,
      name: "Refreshing Spring Water",
      slot: 23,
    },
    { bag: 0, count: 5, item: 159, name: "Refreshing Spring Water", slot: 1 },
    { bag: 255, count: 1, item: 2092, name: "Worn Dagger", slot: 15 },
  ],
  level: 10,
  money: 50_000,
  name: "Fevala",
  ok: true,
  online: false,
  position: { map: 530, o: 0, x: 8735, y: -6685, z: 70.5, zone: 3430 },
  quests: [
    { itemCounts: [], mobCounts: [3], quest: 8325, rewarded: false, status: 3 },
  ],
  race: 10,
  rewardedQuests: [],
  savedAt: "2026-09-26T21:00:00.000Z",
  spells: [585],
  xp: 40,
  ...overrides,
});

describe("truthSummary", () => {
  test("keeps the graded fields and sums items over every row", () => {
    expect(truthSummary(truth())).toEqual({
      alive: true,
      deathState: "alive",
      items: { "159": 25, "2092": 1 },
      level: 10,
      money: 50_000,
      position: { map: 530, o: 0, x: 8735, y: -6685, z: 70.5, zone: 3430 },
      quests: [{ quest: 8325, status: 3 }],
      rewardedQuests: [],
      xp: 40,
    });
  });
});

const row = (seq: number, event: string, data: Record<string, unknown>) =>
  JSON.stringify({
    char: "Fevala",
    class: "log",
    data,
    domain: event.split("/")[0],
    event,
    seq,
    text: `${event} ${seq}`,
    ts: 1_790_489_540_000 + seq,
    v: 1,
  });

async function runDir(files: Record<string, string>): Promise<string> {
  const dir = scratchDir("fill");
  for (const [name, text] of Object.entries(files))
    await writeFile(`${dir}/${name}`, text);
  return dir;
}

const gl = (id: string, text: string): ScenarioCheck => ({
  expect: text,
  id,
  source: "game_log",
});
const tr = (id: string, text: string): ScenarioCheck => ({
  expect: text,
  id,
  source: "truth",
});

describe("totalXp", () => {
  test("adds the XP of every level below to the xp field", () => {
    expect(totalXp(1, 50)).toBe(50);
    expect(totalXp(3, 10)).toBe(400 + 900 + 10);
    expect(totalXp(11, 100) - totalXp(10, 40)).toBe(7600 - 40 + 100);
  });
});

describe("observedChecks on game_log", () => {
  const gamelog = [
    row(1, "quest/accepted", { questId: 8325 }),
    row(2, "quest/progress", { questId: 8325 }),
    row(3, "quest/rewarded", { money: 30, questId: 8325, xp: 100 }),
    row(4, "xp/gain", { amount: 55 }),
  ].join("\n");

  test("puts the row of the named event and id in observed with a ref", async () => {
    const dir = await runDir({ "gamelog.jsonl": `${gamelog}\n` });
    const [check] = await observedChecks(dir, [
      gl(
        "rewarded-packet",
        "the GL rewarded packet (quest/rewarded for 8325) corroborates",
      ),
    ]);
    expect(check?.ref).toBe("gamelog.jsonl:3");
    expect(check?.observed).toMatchObject({
      count: 1,
      events: ["quest/rewarded"],
      match: { data: { questId: 8325 }, event: "quest/rewarded", line: 3 },
    });
    expect(check?.met).toBe(false);
  });

  test("a missing event gives a null match and the last related row", async () => {
    const dir = await runDir({ "gamelog.jsonl": gamelog });
    const [check] = await observedChecks(dir, [
      gl(
        "rewarded-packet",
        "the GL rewarded packet (quest/rewarded for 783) corroborates",
      ),
    ]);
    expect(check?.ref).toBeUndefined();
    expect(check?.observed).toMatchObject({
      count: 0,
      match: null,
      related: { event: "quest/rewarded", line: 3 },
    });
  });

  test("explicit ids and events on the check override the text", async () => {
    const dir = await runDir({
      "gamelog.jsonl": [
        row(1, "combat/cast", { spellId: 2050 }),
        row(2, "combat/cast", { spellId: 75 }),
        row(3, "combat/cast", { spellId: 3044 }),
      ].join("\n"),
    });
    const [check] = await observedChecks(dir, [
      {
        ...gl("ranged-cast", "ranged casts"),
        events: ["combat/cast"],
        ids: [75, 3044],
      },
    ]);
    expect(check?.observed).toMatchObject({
      count: 2,
      ids: [75, 3044],
      match: { line: 2 },
      rows: [{ line: 2 }, { line: 3 }],
    });
  });

  test("a wildcard event matches every event with that prefix", async () => {
    const dir = await runDir({
      "gamelog.jsonl": [
        row(1, "control/move_start", {}),
        row(2, "control/move_stop", {}),
      ].join("\n"),
    });
    const [check] = await observedChecks(dir, [
      gl("halted", "no movement (control/move_*) after the stop"),
    ]);
    expect(check?.observed).toMatchObject({
      count: 2,
      last: { event: "control/move_stop", line: 2 },
      match: { event: "control/move_start", line: 1 },
    });
  });

  test("a slash pair outside the game log domains is not an event", async () => {
    const dir = await runDir({ "gamelog.jsonl": gamelog });
    const [check] = await observedChecks(dir, [
      gl("vitals", "within 5% of GL vitals (T health/power are saved values)"),
    ]);
    expect(check?.observed).toBeNull();
  });

  test("a check that names no event and a missing game log stay null", async () => {
    const dir = await runDir({});
    const filled = await observedChecks(dir, [
      gl("vitals", "within 5% of GL vitals (T health/power are saved values)"),
      gl("kill", "GL combat/kill_credit for a Springpaw Stalker"),
    ]);
    expect(filled.map((check) => check.observed)).toEqual([null, null]);
  });
});

describe("observedChecks on truth", () => {
  const files = (final: Partial<Truth>) => ({
    "baseline.json": JSON.stringify(truth()),
    "final.json": JSON.stringify(truth(final)),
  });

  test("a delta total XP check gets level, xp and the computed delta only", async () => {
    const dir = await runDir(files({ level: 11, xp: 100 }));
    const [check] = await observedChecks(dir, [
      tr("total-xp", "T delta total XP > 0"),
    ]);
    expect(check?.observed).toEqual({
      baseline: { level: 10, totalXp: totalXp(10, 40), xp: 40 },
      delta: { totalXp: 7660 },
      final: { level: 11, totalXp: totalXp(11, 100), xp: 100 },
    });
  });

  test("a rewarded check gets the quest lists only", async () => {
    const dir = await runDir(files({ quests: [], rewardedQuests: [8325] }));
    const [check] = await observedChecks(dir, [
      tr(
        "rewarded",
        "8325 is in T final rewardedQuests and absent from T final quests",
      ),
    ]);
    expect(check?.observed).toEqual({
      baseline: { quests: [{ quest: 8325, status: 3 }], rewardedQuests: [] },
      final: { quests: [], rewardedQuests: [8325] },
    });
  });

  test("an item check gets the changed and named items with deltas", async () => {
    const dir = await runDir(
      files({
        inventory: [
          {
            bag: 0,
            count: 10,
            item: 159,
            name: "Refreshing Spring Water",
            slot: 1,
          },
          { bag: 0, count: 1, item: 20_997, name: "Reward", slot: 2 },
          { bag: 255, count: 1, item: 2092, name: "Worn Dagger", slot: 15 },
        ],
      }),
    );
    const [check] = await observedChecks(dir, [
      tr("water", "T item 159 count, summed over every T row, has delta >= +5"),
    ]);
    expect(check?.observed).toEqual({
      items: {
        "159": {
          baseline: 25,
          delta: -15,
          final: 10,
          name: "Refreshing Spring Water",
        },
        "20997": { baseline: 0, delta: 1, final: 1, name: "Reward" },
      },
    });
  });

  test("an item named in the check is kept even when its count is unchanged", async () => {
    const dir = await runDir(files({}));
    const [check] = await observedChecks(dir, [
      tr("dagger", "T delta Worn Dagger count < 0"),
    ]);
    expect(check?.observed).toEqual({
      items: {
        "2092": { baseline: 1, delta: 0, final: 1, name: "Worn Dagger" },
      },
    });
  });

  test("a position check gets the final position and its 2D distance to the point", async () => {
    const dir = await runDir(
      files({
        position: {
          map: 530,
          o: 0,
          x: 8703.4,
          y: -6642.4,
          z: 72.8,
          zone: 3430,
        },
      }),
    );
    const [check] = await observedChecks(dir, [
      tr(
        "at-marniel",
        "T final position within 5 yd of marniel (8700.4, -6638.4, 72.8, map 530)",
      ),
    ]);
    expect(check?.observed).toEqual({
      distance2d: 5,
      final: {
        position: {
          map: 530,
          o: 0,
          x: 8703.4,
          y: -6642.4,
          z: 72.8,
          zone: 3430,
        },
      },
      point: { x: 8700.4, y: -6638.4 },
    });
  });

  test("an alive check gets alive and deathState", async () => {
    const dir = await runDir(files({}));
    const [check] = await observedChecks(dir, [
      tr("alive", "T final alive is true and T final deathState is alive"),
    ]);
    expect(check?.observed).toEqual({
      baseline: { alive: true, deathState: "alive" },
      final: { alive: true, deathState: "alive" },
    });
  });

  test("a money check gets money and its delta", async () => {
    const dir = await runDir(files({ money: 50_030 }));
    const [check] = await observedChecks(dir, [
      tr("money", "T delta money >= +30"),
    ]);
    expect(check?.observed).toEqual({
      baseline: { money: 50_000 },
      delta: { money: 30 },
      final: { money: 50_030 },
    });
  });

  test("a missing final truth leaves final null and no delta", async () => {
    const dir = await runDir({ "baseline.json": JSON.stringify(truth()) });
    const [check] = await observedChecks(dir, [
      tr("level", "the stated level equals T baseline level"),
    ]);
    expect(check?.observed).toEqual({ baseline: { level: 10 }, final: null });
  });

  test("no truth at all leaves the check null", async () => {
    const dir = await runDir({});
    const [check] = await observedChecks(dir, [
      tr("level", "the stated level"),
    ]);
    expect(check?.observed).toBeNull();
  });
});
