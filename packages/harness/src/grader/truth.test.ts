import { describe, expect, test } from "bun:test";
import {
  finalTruth,
  parseTruth,
  readTruth,
  TRUTH_ARGV,
} from "#harness/grader/truth";
import { failed, fakeExec, ok } from "#test-support/fake-exec";

const ACCOUNT = "FAC6AB817400D";

function reply(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    account: ACCOUNT,
    alive: true,
    class: 5,
    deathState: "alive",
    gender: 1,
    guid: 2958,
    health: 28,
    hearth: { map: 530, x: 8714.14, y: -6650.33, z: 72.75, zone: 3430 },
    inventory: [
      {
        bag: 255,
        count: 20,
        durability: 0,
        guid: 1_055_036,
        item: 117,
        maxDurability: 0,
        name: "Tough Jerky",
        slot: 23,
      },
    ],
    level: 12,
    mail: [],
    money: 123_486,
    name: "Fsvctesta",
    ok: true,
    online: false,
    position: {
      map: 530,
      o: 4.36,
      x: 7564.25,
      y: -6872.23,
      z: 96.04,
      zone: 3433,
    },
    power: [607, 0, 0, 100, 0, 0, 0],
    quests: [
      {
        explored: false,
        itemCounts: [0, 0, 0, 0, 0, 0],
        mobCounts: [3, 0, 0, 0],
        quest: 8325,
        rewarded: false,
        status: 3,
        timer: 0,
      },
    ],
    race: 10,
    rewardedQuests: [8325],
    savedAt: "2026-09-26T19:04:55.896Z",
    spells: [585, 2050],
    xp: 10,
    ...overrides,
  };
}

describe("parseTruth", () => {
  test("keeps the contract fields of a service reply", () => {
    expect(parseTruth(reply())).toEqual({
      account: ACCOUNT,
      alive: true,
      class: 5,
      deathState: "alive",
      guid: 2958,
      health: 28,
      inventory: [
        { bag: 255, count: 20, item: 117, name: "Tough Jerky", slot: 23 },
      ],
      level: 12,
      money: 123_486,
      name: "Fsvctesta",
      ok: true,
      online: false,
      position: {
        map: 530,
        o: 4.36,
        x: 7564.25,
        y: -6872.23,
        z: 96.04,
        zone: 3433,
      },
      quests: [
        {
          itemCounts: [0, 0, 0, 0, 0, 0],
          mobCounts: [3, 0, 0, 0],
          quest: 8325,
          rewarded: false,
          status: 3,
        },
      ],
      race: 10,
      rewardedQuests: [8325],
      savedAt: "2026-09-26T19:04:55.896Z",
      spells: [585, 2050],
      xp: 10,
    });
  });

  test("throws on a refusal with its reason", () => {
    expect(() =>
      parseTruth({
        error: "no such character",
        ok: false,
        reason: "character_not_found",
      }),
    ).toThrow("truth refused: character_not_found");
  });

  test("names a wrong field", () => {
    expect(() => parseTruth(reply({ deathState: "undead" }))).toThrow(
      "truth.deathState: expected alive|dead|ghost",
    );
    expect(() => parseTruth(reply({ position: { map: 530 } }))).toThrow(
      "truth.position.o: expected a number",
    );
    expect(() => parseTruth(reply({ inventory: [{ bag: 255 }] }))).toThrow(
      "truth.inventory[0].count: expected a number",
    );
  });
});

describe("readTruth", () => {
  test("runs soap truth for the account and parses the reply", async () => {
    const { calls, exec } = fakeExec(() =>
      ok(JSON.stringify(reply(), null, 2)),
    );
    const truth = await readTruth(exec, ACCOUNT);
    expect(truth.level).toBe(12);
    expect(calls[0]?.argv).toEqual([...TRUTH_ARGV, ACCOUNT]);
  });

  test("reports the service reason when soap truth fails", async () => {
    const { exec } = fakeExec(() =>
      failed(
        1,
        "service down",
        JSON.stringify({
          error: "fetch failed",
          ok: false,
          reason: "service_down",
        }),
      ),
    );
    await expect(readTruth(exec, ACCOUNT)).rejects.toThrow(
      "truth refused: service_down",
    );
  });

  test("reports stderr when there is no JSON", async () => {
    const { exec } = fakeExec(() => failed(1, "usage: soap truth <ACCOUNT>"));
    await expect(readTruth(exec, ACCOUNT)).rejects.toThrow(
      "soap truth exited 1: usage: soap truth <ACCOUNT>",
    );
  });
});

describe("finalTruth", () => {
  const exitMs = Date.parse("2026-09-26T21:00:00.000Z");
  const fresh = reply({ savedAt: "2026-09-26T20:59:57.000Z" });

  test("accepts an offline save made after the exit minus 5 s", async () => {
    const { exec } = fakeExec(() => ok(JSON.stringify(fresh)));
    const final = await finalTruth({
      account: ACCOUNT,
      exec,
      exitMs,
      waitMs: 1,
    });
    expect(final.ok && final.truth.savedAt).toBe("2026-09-26T20:59:57.000Z");
  });

  test("reads again while the character is still online", async () => {
    const replies = [
      reply({ online: true, savedAt: "2026-09-26T21:00:01.000Z" }),
      fresh,
    ];
    const { calls, exec } = fakeExec(() =>
      ok(JSON.stringify(replies.shift() ?? fresh)),
    );
    const final = await finalTruth({
      account: ACCOUNT,
      exec,
      exitMs,
      waitMs: 1,
    });
    expect(final.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  test("gives stale_truth after three old saves", async () => {
    const { calls, exec } = fakeExec(() =>
      ok(JSON.stringify(reply({ savedAt: "2026-09-25T10:00:00.000Z" }))),
    );
    const final = await finalTruth({
      account: ACCOUNT,
      exec,
      exitMs,
      waitMs: 1,
    });
    expect(final).toEqual({
      cause: "stale_truth",
      detail:
        "online=false savedAt=2026-09-25T10:00:00.000Z exit=2026-09-26T21:00:00.000Z",
      ok: false,
    });
    expect(calls).toHaveLength(3);
  });

  test("gives service_down when a read fails", async () => {
    const { exec } = fakeExec(() => failed(1, "connect refused"));
    const final = await finalTruth({
      account: ACCOUNT,
      exec,
      exitMs,
      waitMs: 1,
    });
    expect(final).toEqual({
      cause: "service_down",
      detail: "soap truth exited 1: connect refused",
      ok: false,
    });
  });
});
