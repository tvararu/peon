import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  raidGroupListBody,
  raidPartyMemberStatsBody,
} from "#test-support/areas/raid";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

const TOM = 0x10n;
const ANN = 0x20n;
const SELF = 0x99n;

function list(counter: number, guids: readonly bigint[]) {
  return raidGroupListBody({
    counter,
    leader: SELF,
    loot: { method: 1, threshold: 2 },
    members: guids.map((guid) => ({
      guid,
      name: guid === TOM ? "Tom" : "Ann",
    })),
    type: 0,
  });
}

function requests(rig: {
  sent: readonly { opcode: number; body: Uint8Array }[];
}) {
  return rig.sent
    .filter((p) => p.opcode === GameOpcode.CMSG_REQUEST_PARTY_MEMBER_STATS)
    .map((p) => new PacketReader(p.body).uint64LE());
}

function rigAt(clock: { t: number }) {
  return areaRig("raid", { now: () => clock.t, selfGuid: SELF });
}

describe("raid member stats policy", () => {
  test("requests stats once for each member the roster adds", () => {
    const clock = { t: 0 };
    const rig = rigAt(clock);
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, list(0, [TOM]));
      expect(requests(rig)).toEqual([TOM]);
      rig.inject(GameOpcode.SMSG_GROUP_LIST, list(1, [TOM, ANN]));
      expect(requests(rig)).toEqual([TOM, ANN]);
    } finally {
      rig.dispose();
    }
  });

  test("a read of fresh stats sends nothing", () => {
    const clock = { t: 0 };
    const rig = rigAt(clock);
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, list(0, [TOM]));
      rig.inject(
        GameOpcode.SMSG_PARTY_MEMBER_STATS,
        raidPartyMemberStatsBody({ guid: TOM, hp: 5, status: 1 }),
      );
      clock.t = 29_000;
      expect(rig.handle.act.memberStats("Tom")?.hp).toBe(5);
      expect(requests(rig)).toEqual([TOM]);
    } finally {
      rig.dispose();
    }
  });

  test("a read of stale stats requests once per member per 10 s", () => {
    const clock = { t: 0 };
    const rig = rigAt(clock);
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, list(0, [TOM, ANN]));
      rig.inject(
        GameOpcode.SMSG_PARTY_MEMBER_STATS,
        raidPartyMemberStatsBody({ guid: TOM, hp: 5, status: 1 }),
      );
      clock.t = 31_000;
      rig.handle.act.memberStats("Tom");
      rig.handle.act.memberStats("Tom");
      expect(requests(rig)).toEqual([TOM, ANN, TOM]);
      clock.t = 40_999;
      rig.handle.act.memberStats("Tom");
      expect(requests(rig)).toEqual([TOM, ANN, TOM]);
      clock.t = 41_000;
      rig.handle.act.memberStats("Tom");
      expect(requests(rig)).toEqual([TOM, ANN, TOM, TOM]);
    } finally {
      rig.dispose();
    }
  });

  test("a read of a member with no stats yet requests after the throttle", () => {
    const clock = { t: 0 };
    const rig = rigAt(clock);
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, list(0, [TOM]));
      clock.t = 5000;
      expect(rig.handle.act.memberStats("Tom")).toBeUndefined();
      expect(requests(rig)).toEqual([TOM]);
      clock.t = 10_000;
      rig.handle.act.memberStats("Tom");
      expect(requests(rig)).toEqual([TOM, TOM]);
    } finally {
      rig.dispose();
    }
  });

  test("requestMemberStats sends one request for the named member", () => {
    const clock = { t: 0 };
    const rig = rigAt(clock);
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, list(0, [TOM, ANN]));
      rig.handle.act.requestMemberStats("Ann");
      expect(requests(rig)).toEqual([TOM, ANN, ANN]);
    } finally {
      rig.dispose();
    }
  });

  test("requestMemberStats throws for a name outside the group", () => {
    const clock = { t: 0 };
    const rig = rigAt(clock);
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, list(0, [TOM]));
      expect(() => rig.handle.act.requestMemberStats("Bob")).toThrow("Bob");
      expect(requests(rig)).toEqual([TOM]);
    } finally {
      rig.dispose();
    }
  });

  test("stats are dropped after the group disbands", () => {
    const clock = { t: 0 };
    const rig = rigAt(clock);
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, list(0, [TOM]));
      rig.inject(
        GameOpcode.SMSG_PARTY_MEMBER_STATS,
        raidPartyMemberStatsBody({ guid: TOM, hp: 5, status: 1 }),
      );
      expect(rig.handle.act.memberStats("Tom")?.hp).toBe(5);
      rig.inject(GameOpcode.SMSG_GROUP_LIST, list(1, []));
      expect(rig.stores.areas.raid.snapshot().stats?.has(TOM)).toBe(false);
      expect(() => rig.handle.act.requestMemberStats("Tom")).toThrow("Tom");
    } finally {
      rig.dispose();
    }
  });
});
