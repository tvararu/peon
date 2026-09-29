import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  raidGroupListBody,
  raidPartyMemberOfflineBody,
  raidPartyMemberStatsBody,
  raidPartyMemberStatsFullBody,
} from "#test-support/areas/raid";
import {
  mergeMemberStats,
  statsTransitions,
} from "#wow/areas/raid/store-stats";
import { GameOpcode } from "#wow/protocol/opcodes";

const TOM = 0x10n;
const ANN = 0x20n;

function roster(counter = 0) {
  return raidGroupListBody({
    counter,
    leader: TOM,
    loot: { method: 1, threshold: 2 },
    members: [
      { guid: TOM, name: "Tom" },
      { guid: ANN, name: "Ann" },
    ],
    type: 0,
  });
}

function annStats(status: number) {
  return raidPartyMemberStatsBody({ guid: ANN, hp: 4200, status });
}

describe("raid stats store", () => {
  test("sets the stats slice for a rostered member", () => {
    const rig = areaRig("raid");
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, roster());
      rig.inject(
        GameOpcode.SMSG_PARTY_MEMBER_STATS_FULL,
        raidPartyMemberStatsFullBody({
          guid: ANN,
          hp: 4200,
          level: 80,
          maxHp: 9000,
          maxPower: 1000,
          position: { x: 9040, y: -6250 },
          power: 450,
          powerType: 1,
          status: 1,
          zone: 3430,
        }),
      );
      expect(rig.stores.areas.raid.snapshot().stats?.get(ANN)).toMatchObject({
        hp: 4200,
        level: 80,
        name: "Ann",
        position: { x: 9040, y: -6250 },
        power: 450,
        powerType: 1,
        zone: 3430,
      });
    } finally {
      rig.dispose();
    }
  });

  test("reports died, ghost, revived, offline and online transitions", () => {
    const rig = areaRig("raid");
    const seen: string[] = [];
    const stop = rig.handle.onEvent((event) => {
      if (event.type === "member_stats")
        seen.push(...event.transitions, event.name);
    });
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, roster());
      rig.inject(GameOpcode.SMSG_PARTY_MEMBER_STATS, annStats(1));
      rig.inject(GameOpcode.SMSG_PARTY_MEMBER_STATS, annStats(5));
      rig.inject(GameOpcode.SMSG_PARTY_MEMBER_STATS, annStats(9));
      rig.inject(GameOpcode.SMSG_PARTY_MEMBER_STATS, annStats(1));
      rig.inject(
        GameOpcode.SMSG_PARTY_MEMBER_STATS_FULL,
        raidPartyMemberOfflineBody(ANN),
      );
      rig.inject(GameOpcode.SMSG_PARTY_MEMBER_STATS, annStats(1));
      expect(seen).toEqual([
        "Ann",
        "died",
        "Ann",
        "ghost",
        "Ann",
        "revived",
        "Ann",
        "offline",
        "Ann",
        "online",
        "Ann",
      ]);
    } finally {
      stop();
      rig.dispose();
    }
  });

  test("carries the full guid and member name", () => {
    const rig = areaRig("raid");
    const events: unknown[] = [];
    const stop = rig.handle.onEvent((event) => {
      events.push(event);
    });
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, roster());
      rig.inject(GameOpcode.SMSG_PARTY_MEMBER_STATS, annStats(1));
      expect(events).toContainEqual({
        guid: ANN,
        name: "Ann",
        transitions: [],
        type: "member_stats",
      });
    } finally {
      stop();
      rig.dispose();
    }
  });

  test("ignores stats for a guid outside the roster", () => {
    const rig = areaRig("raid");
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, roster());
      rig.inject(
        GameOpcode.SMSG_PARTY_MEMBER_STATS,
        raidPartyMemberStatsBody({ guid: 0x99n, hp: 1, status: 1 }),
      );
      expect(
        rig.stores.areas.raid.snapshot().stats?.get(0x99n),
      ).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });
});

describe("statsTransitions", () => {
  test("stays quiet for the first sighting", () => {
    expect(statsTransitions(undefined, { status: 5 })).toEqual([]);
  });
});

describe("mergeMemberStats", () => {
  test("keeps the previous values a partial mask leaves out", () => {
    const full = mergeMemberStats(
      {
        guidHigh: 0,
        guidLow: 0x20,
        hp: 4200,
        level: 80,
        maxHp: 9000,
        online: true,
        position: { x: 1, y: 2 },
        status: 1,
        zone: 3430,
      },
      undefined,
      "Ann",
      1000,
    );
    const merged = mergeMemberStats(
      { guidHigh: 0, guidLow: 0x20, hp: 4100 },
      full,
      "Ann",
      2000,
    );
    expect(merged).toMatchObject({
      hp: 4100,
      level: 80,
      position: { x: 1, y: 2 },
      seenAt: 2000,
      zone: 3430,
    });
  });
});
