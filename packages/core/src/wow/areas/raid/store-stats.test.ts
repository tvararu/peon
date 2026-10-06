import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  raidGroupLeftBody,
  raidGroupListBody,
  raidPartyMemberOfflineBody,
  raidPartyMemberStatsBody,
  raidPartyMemberStatsFullBody,
} from "#test-support/areas/raid";
import { mergeMemberStats } from "#wow/areas/raid/store-stats";
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

describe("raid stats after roster changes", () => {
  function tomOnly(counter: number) {
    return raidGroupListBody({
      counter,
      leader: TOM,
      loot: { method: 1, threshold: 2 },
      members: [{ guid: TOM, name: "Tom" }],
      type: 0,
    });
  }

  test("drops a departed member's stats and keeps the rest", () => {
    const rig = areaRig("raid");
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, roster());
      rig.inject(GameOpcode.SMSG_PARTY_MEMBER_STATS, annStats(1));
      rig.inject(
        GameOpcode.SMSG_PARTY_MEMBER_STATS,
        raidPartyMemberStatsBody({ guid: TOM, hp: 10, status: 1 }),
      );
      rig.inject(GameOpcode.SMSG_GROUP_LIST, tomOnly(1));
      const stats = rig.stores.areas.raid.snapshot().stats;
      expect(stats?.has(ANN)).toBe(false);
      expect(stats?.get(TOM)?.hp).toBe(10);
    } finally {
      rig.dispose();
    }
  });

  test("clears every member's stats when the group disbands", () => {
    const rig = areaRig("raid");
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, roster());
      rig.inject(GameOpcode.SMSG_PARTY_MEMBER_STATS, annStats(1));
      rig.inject(GameOpcode.SMSG_GROUP_LIST, raidGroupLeftBody(1));
      expect(rig.stores.areas.raid.snapshot().stats?.size).toBe(0);
    } finally {
      rig.dispose();
    }
  });

  test("does not carry stale status into a rejoin", () => {
    const rig = areaRig("raid");
    const seen: string[] = [];
    const stop = rig.handle.onEvent((event) => {
      if (event.type === "member_stats") seen.push(...event.transitions);
    });
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, roster());
      rig.inject(GameOpcode.SMSG_PARTY_MEMBER_STATS, annStats(1));
      rig.inject(GameOpcode.SMSG_GROUP_LIST, tomOnly(1));
      rig.inject(GameOpcode.SMSG_GROUP_LIST, roster(2));
      rig.inject(GameOpcode.SMSG_PARTY_MEMBER_STATS, annStats(5));
      expect(seen).toEqual([]);
      expect(rig.stores.areas.raid.snapshot().stats?.get(ANN)?.hp).toBe(4200);
    } finally {
      stop();
      rig.dispose();
    }
  });
});

describe("raid pet removal", () => {
  const PET = 0xf1_30_00_00_00_00_00_42n;

  test("clears the pet on an explicit zero pet guid", () => {
    const rig = areaRig("raid");
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, roster());
      rig.inject(
        GameOpcode.SMSG_PARTY_MEMBER_STATS,
        raidPartyMemberStatsBody({
          guid: ANN,
          pet: { guid: PET, hp: 100, name: "Rex" },
        }),
      );
      expect(rig.stores.areas.raid.snapshot().stats?.get(ANN)?.pet?.guid).toBe(
        PET,
      );
      rig.inject(
        GameOpcode.SMSG_PARTY_MEMBER_STATS,
        raidPartyMemberStatsBody({ guid: ANN, pet: { guid: 0n } }),
      );
      expect(rig.stores.areas.raid.snapshot().stats?.get(ANN)?.pet).toBeNull();
    } finally {
      rig.dispose();
    }
  });

  test("keeps the pet when the update leaves the pet fields out", () => {
    const rig = areaRig("raid");
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, roster());
      rig.inject(
        GameOpcode.SMSG_PARTY_MEMBER_STATS,
        raidPartyMemberStatsBody({
          guid: ANN,
          pet: { guid: PET, hp: 100, name: "Rex" },
        }),
      );
      rig.inject(GameOpcode.SMSG_PARTY_MEMBER_STATS, annStats(1));
      expect(rig.stores.areas.raid.snapshot().stats?.get(ANN)?.pet?.name).toBe(
        "Rex",
      );
    } finally {
      rig.dispose();
    }
  });

  test("a pet hp-only update keeps the other pet fields", () => {
    const rig = areaRig("raid");
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, roster());
      rig.inject(
        GameOpcode.SMSG_PARTY_MEMBER_STATS,
        raidPartyMemberStatsBody({
          guid: ANN,
          pet: {
            auras: [{ flags: 1, slot: 2, spellId: 136 }],
            displayId: 4444,
            guid: PET,
            hp: 100,
            maxHp: 200,
            maxPower: 90,
            name: "Rex",
            power: 40,
            powerType: 2,
          },
        }),
      );
      rig.inject(
        GameOpcode.SMSG_PARTY_MEMBER_STATS,
        raidPartyMemberStatsBody({ guid: ANN, pet: { hp: 60 } }),
      );
      expect(rig.stores.areas.raid.snapshot().stats?.get(ANN)?.pet).toEqual({
        auras: [{ flags: 1, slot: 2, spellId: 136 }],
        displayId: 4444,
        guid: PET,
        hp: 60,
        maxHp: 200,
        maxPower: 90,
        name: "Rex",
        power: 40,
        powerType: 2,
      });
    } finally {
      rig.dispose();
    }
  });

  test("an offline reply keeps the observed power type", () => {
    const rig = areaRig("raid");
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, roster());
      rig.inject(
        GameOpcode.SMSG_PARTY_MEMBER_STATS,
        raidPartyMemberStatsBody({
          guid: ANN,
          power: 450,
          powerType: 1,
          status: 1,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_PARTY_MEMBER_STATS_FULL,
        raidPartyMemberOfflineBody(ANN),
      );
      expect(rig.stores.areas.raid.snapshot().stats?.get(ANN)).toMatchObject({
        online: false,
        powerType: 1,
      });
    } finally {
      rig.dispose();
    }
  });

  test("a full reply without a pet leaves no pet", () => {
    const rig = areaRig("raid");
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, roster());
      rig.inject(
        GameOpcode.SMSG_PARTY_MEMBER_STATS_FULL,
        raidPartyMemberStatsFullBody({
          guid: ANN,
          hp: 5,
          status: 1,
        }),
      );
      expect(rig.stores.areas.raid.snapshot().stats?.get(ANN)?.pet).toBeNull();
    } finally {
      rig.dispose();
    }
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
