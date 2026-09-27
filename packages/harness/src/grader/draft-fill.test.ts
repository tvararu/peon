import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { observedChecks, truthSummary } from "#harness/grader/draft-fill";
import type { ScenarioCheck } from "#harness/grader/scenarios";
import type { Truth } from "#harness/grader/truth";

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

const checks: ScenarioCheck[] = [
  { expect: "level", id: "level", source: "truth" },
  { expect: "gl", id: "gl", source: "game_log" },
];

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

describe("observedChecks", () => {
  test("fills truth checks from baseline and final and leaves the rest null", async () => {
    const dir = await mkdtemp(`${tmpdir()}/fill-`);
    await writeFile(`${dir}/baseline.json`, JSON.stringify(truth()));
    await writeFile(
      `${dir}/final.json`,
      JSON.stringify(truth({ level: 11, xp: 0 })),
    );
    const filled = await observedChecks(dir, checks);
    expect(filled[0]?.observed).toMatchObject({
      baseline: { level: 10, xp: 40 },
      final: { level: 11, xp: 0 },
    });
    expect(filled[0]?.met).toBe(false);
    expect(filled[1]?.observed).toBeNull();
  });

  test("a missing final truth leaves final null", async () => {
    const dir = await mkdtemp(`${tmpdir()}/fill-`);
    await writeFile(`${dir}/baseline.json`, JSON.stringify(truth()));
    const filled = await observedChecks(dir, checks);
    expect(filled[0]?.observed).toMatchObject({ final: null });
  });

  test("no truth at all leaves every check null", async () => {
    const dir = await mkdtemp(`${tmpdir()}/fill-`);
    const filled = await observedChecks(dir, checks);
    expect(filled.map((check) => check.observed)).toEqual([null, null]);
  });
});
