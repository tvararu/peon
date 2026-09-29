import { describe, expect, jest, test } from "bun:test";
import {
  type FinalTruth,
  finalTruth,
  parseTruth,
  readTruth,
  TRUTH_ARGV,
} from "#harness/grader/truth";
import { failed, fakeExec, ok } from "#test-support/fake-exec";

const ACCOUNT = "FAC6AB817400D";

const LIVE_REPLY = {
  account: ACCOUNT,
  alive: true,
  class: 5,
  deathState: "alive",
  gender: 1,
  guid: 3509,
  health: 217,
  hearth: {
    map: 530,
    x: 10_349.599_609_375,
    y: -6357.290_039_062_5,
    z: 33.402_599_334_716_8,
    zone: 3431,
  },
  inventory: [
    {
      bag: 255,
      count: 1,
      durability: 0,
      guid: 1_127_960,
      item: 53,
      maxDurability: 0,
      name: "Neophyte's Shirt",
      slot: 3,
    },
    {
      bag: 255,
      count: 1,
      durability: 50,
      guid: 1_127_961,
      item: 9749,
      maxDurability: 50,
      name: "Simple Blouse",
      slot: 4,
    },
  ],
  level: 10,
  levelTimeSec: 85,
  mail: [
    { id: 1403, items: 1, money: 0, subject: "Peon" },
    { id: 1404, items: 0, money: 150, subject: "Peon" },
  ],
  money: 50_000,
  name: "Fsvctesta",
  ok: true,
  online: false,
  position: {
    map: 530,
    o: 1.685_999_989_509_582_5,
    x: 8735,
    y: -6685,
    z: 70.5,
    zone: 3430,
  },
  power: [607, 0, 0, 100, 0, 0, 0],
  quests: [],
  race: 10,
  reputation: [
    { faction: 21, flags: 64, standing: 0 },
    { faction: 46, flags: 4, standing: 0 },
    { faction: 1156, flags: 16, standing: 0 },
  ],
  rewardedQuests: [5653, 10_364, 10_534, 10_539, 10_638],
  savedAt: "2026-09-25T20:55:40.000Z",
  spells: [17, 139, 586, 589, 591, 594, 1243, 2006, 2052],
  totalKillsPvp: 0,
  totalTimeSec: 88,
  xp: 0,
};

const WITHOUT_NEW_FIELDS = {
  ...LIVE_REPLY,
  hearth: undefined,
  inventory: [
    { bag: 255, count: 1, item: 53, name: "Neophyte's Shirt", slot: 3 },
  ],
  mail: undefined,
  reputation: undefined,
};

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

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
      hearth: { map: 530, x: 8714.14, y: -6650.33, z: 72.75, zone: 3430 },
      inventory: [
        {
          bag: 255,
          count: 20,
          durability: 0,
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

  test("keeps hearth, reputation, mail and durability of a live reply", () => {
    const truth = parseTruth(LIVE_REPLY);
    expect(truth.hearth).toEqual(LIVE_REPLY.hearth);
    expect(truth.reputation).toEqual(LIVE_REPLY.reputation);
    expect(truth.mail).toEqual(LIVE_REPLY.mail);
    expect(truth.inventory).toEqual([
      {
        bag: 255,
        count: 1,
        durability: 0,
        item: 53,
        maxDurability: 0,
        name: "Neophyte's Shirt",
        slot: 3,
      },
      {
        bag: 255,
        count: 1,
        durability: 50,
        item: 9749,
        maxDurability: 50,
        name: "Simple Blouse",
        slot: 4,
      },
    ]);
  });

  test("parses a reply without the optional fields", () => {
    const truth = parseTruth(JSON.parse(JSON.stringify(WITHOUT_NEW_FIELDS)));
    expect(truth.hearth).toBeUndefined();
    expect(truth.reputation).toBeUndefined();
    expect(truth.mail).toBeUndefined();
    expect(truth.inventory[0]?.durability).toBeUndefined();
    expect(truth.inventory[0]?.maxDurability).toBeUndefined();
    expect(Object.keys(truth)).not.toContain("hearth");
  });

  test("reads a null hearth as none for a character never logged in", () => {
    const truth = parseTruth({ ...LIVE_REPLY, hearth: null });
    expect(Object.keys(truth)).not.toContain("hearth");
  });

  test("names a wrong optional field", () => {
    const live = (overrides: Record<string, unknown>) => ({
      ...LIVE_REPLY,
      ...overrides,
    });
    expect(() =>
      parseTruth(live({ hearth: { ...LIVE_REPLY.hearth, x: "far" } })),
    ).toThrow("truth.hearth.x: expected a number");
    expect(() => parseTruth(live({ reputation: {} }))).toThrow(
      "truth.reputation: expected an array",
    );
    expect(() =>
      parseTruth(live({ reputation: [{ faction: 21, flags: 64 }] })),
    ).toThrow("truth.reputation[0].standing: expected a number");
    expect(() =>
      parseTruth(live({ mail: [{ id: 1, items: 0, money: 0, subject: 7 }] })),
    ).toThrow("truth.mail[0].subject: expected a string");
    expect(() =>
      parseTruth(
        live({ inventory: [{ ...LIVE_REPLY.inventory[1], durability: "50" }] }),
      ),
    ).toThrow("truth.inventory[0].durability: expected a number");
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

  test("gives stale_truth at once for an offline character with an old save", async () => {
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
    expect(calls).toHaveLength(1);
  });

  test("polls every 10 s until the character goes offline, then checks the save", async () => {
    jest.useFakeTimers();
    try {
      let now = exitMs;
      const online = reply({
        online: true,
        savedAt: "2026-09-26T20:50:00.000Z",
      });
      const offline = reply({ savedAt: "2026-09-26T21:00:58.000Z" });
      const { calls, exec } = fakeExec(() =>
        ok(JSON.stringify(now - exitMs >= 60_000 ? offline : online)),
      );
      let final: FinalTruth | undefined;
      const pending = finalTruth({
        account: ACCOUNT,
        clock: { now: () => now },
        exec,
        exitMs,
      }).then((result) => {
        final = result;
      });
      for (let step = 0; step < 6; step += 1) {
        await flush();
        now += 10_000;
        jest.advanceTimersByTime(10_000);
      }
      await pending;
      expect(calls).toHaveLength(7);
      expect(final?.ok && final.truth.savedAt).toBe("2026-09-26T21:00:58.000Z");
    } finally {
      jest.useRealTimers();
    }
  });

  test("gives stale_truth when the character is still online after 90 s", async () => {
    jest.useFakeTimers();
    try {
      let now = exitMs;
      const { calls, exec } = fakeExec(() =>
        ok(
          JSON.stringify(
            reply({ online: true, savedAt: "2026-09-26T21:00:30.000Z" }),
          ),
        ),
      );
      let final: FinalTruth | undefined;
      const pending = finalTruth({
        account: ACCOUNT,
        clock: { now: () => now },
        exec,
        exitMs,
      }).then((result) => {
        final = result;
      });
      for (let step = 0; step < 9; step += 1) {
        await flush();
        expect(final).toBeUndefined();
        now += 10_000;
        jest.advanceTimersByTime(10_000);
      }
      await pending;
      expect(calls).toHaveLength(10);
      expect(final).toEqual({
        cause: "stale_truth",
        detail:
          "online=true savedAt=2026-09-26T21:00:30.000Z exit=2026-09-26T21:00:00.000Z",
        ok: false,
      });
    } finally {
      jest.useRealTimers();
    }
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
