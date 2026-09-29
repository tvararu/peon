import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  instancesDifficultyBody,
  instancesResetBody,
  instancesResetFailedBody,
  instancesResetFailedNotifyBody,
} from "#test-support/areas/instances";
import {
  buildResetInstances,
  buildSetDungeonDifficulty,
  buildSetRaidDifficulty,
} from "#wow/areas/instances/protocol";
import type { PartyMember, PartyState } from "#wow/party-store";
import { GameOpcode } from "#wow/protocol/opcodes";

function member(name: string): PartyMember {
  return {
    name,
    guid: 0x10n,
    online: true,
    health: null,
    maxHealth: null,
    level: null,
    statsAt: null,
    source: null,
  };
}

const SOLO: PartyState = {
  inGroup: false,
  leader: null,
  loot: null,
  members: [],
};
const LEADING: PartyState = {
  inGroup: true,
  leader: "Me",
  loot: null,
  members: [member("Partner")],
};
const FOLLOWING: PartyState = {
  inGroup: true,
  leader: "Partner",
  loot: null,
  members: [member("Partner"), member("Other")],
};

function rigIn(party: PartyState) {
  return areaRig("instances", {
    legacy: {
      party: () => party,
      friends: () => [],
      ignored: () => [],
      guild: () => undefined,
      channels: () => [],
    },
  });
}

const opcodes = (rig: { sent: readonly { opcode: number }[] }) =>
  rig.sent.map((packet) => packet.opcode);

const dungeon = (value: number) => ({ kind: "dungeon", value }) as const;
const raid = (value: number) => ({ kind: "raid", value }) as const;

describe("instances runtime: setDifficulty refusals", () => {
  test("out of range refuses out_of_range and sends nothing (MiscHandler.cpp:1273,1323)", async () => {
    const rig = rigIn(SOLO);
    try {
      for (const init of [dungeon(3), dungeon(-1), raid(4), raid(1.5)])
        expect(await rig.handle.act.setDifficulty(init)).toEqual({
          status: "refused",
          reason: "out_of_range",
        });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("the current value refuses unchanged, also a pending solo change (MiscHandler.cpp:1275,1325)", async () => {
    jest.useFakeTimers();
    const rig = rigIn(SOLO);
    try {
      rig.inject(
        GameOpcode.MSG_SET_DUNGEON_DIFFICULTY,
        instancesDifficultyBody({ difficulty: 0, inGroup: false }),
      );
      expect(await rig.handle.act.setDifficulty(dungeon(0))).toEqual({
        status: "refused",
        reason: "unchanged",
      });
      const pending = rig.handle.act.setDifficulty(dungeon(1));
      jest.advanceTimersByTime(2000);
      expect(await pending).toEqual({ status: "unconfirmed_solo" });
      expect(await rig.handle.act.setDifficulty(dungeon(1))).toEqual({
        status: "refused",
        reason: "unchanged",
      });
      expect(rig.sent).toHaveLength(1);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a group member who is not the leader refuses not_leader (MiscHandler.cpp:1281,1331)", async () => {
    const rig = rigIn(FOLLOWING);
    try {
      for (const init of [dungeon(1), raid(2)])
        expect(await rig.handle.act.setDifficulty(init)).toEqual({
          status: "refused",
          reason: "not_leader",
        });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});

describe("instances runtime: setDifficulty", () => {
  test("sends the mode and settles ok when the echo carries the new value", async () => {
    const rig = rigIn(LEADING);
    try {
      const pending = rig.handle.act.setDifficulty(dungeon(1));
      expect(rig.sent).toEqual([
        {
          opcode: GameOpcode.MSG_SET_DUNGEON_DIFFICULTY,
          body: buildSetDungeonDifficulty(1),
        },
      ]);
      rig.inject(
        GameOpcode.MSG_SET_DUNGEON_DIFFICULTY,
        instancesDifficultyBody({ difficulty: 1, inGroup: true }),
      );
      expect(await pending).toEqual({ status: "ok", result: "changed" });
      expect(rig.handle.state().dungeonDifficulty).toBe(1);
    } finally {
      rig.dispose();
    }
  });

  test("a raid request sends the raid opcode and reads only the raid echo", async () => {
    const rig = rigIn(LEADING);
    try {
      const pending = rig.handle.act.setDifficulty(raid(2));
      expect(rig.sent).toEqual([
        {
          opcode: GameOpcode.MSG_SET_RAID_DIFFICULTY,
          body: buildSetRaidDifficulty(2),
        },
      ]);
      rig.inject(
        GameOpcode.MSG_SET_DUNGEON_DIFFICULTY,
        instancesDifficultyBody({ difficulty: 0, inGroup: true }),
      );
      rig.inject(
        GameOpcode.MSG_SET_RAID_DIFFICULTY,
        instancesDifficultyBody({ difficulty: 2, inGroup: true }),
      );
      expect(await pending).toEqual({ status: "ok", result: "changed" });
    } finally {
      rig.dispose();
    }
  });

  test("an echo with the old value refuses server_refused, also when the store already holds it (MiscHandler.cpp:1291,1297,1310)", async () => {
    const rig = rigIn(SOLO);
    try {
      rig.inject(
        GameOpcode.MSG_SET_DUNGEON_DIFFICULTY,
        instancesDifficultyBody({ difficulty: 0, inGroup: false }),
      );
      const pending = rig.handle.act.setDifficulty(dungeon(1));
      rig.inject(
        GameOpcode.MSG_SET_DUNGEON_DIFFICULTY,
        instancesDifficultyBody({ difficulty: 0, inGroup: false }),
      );
      expect(await pending).toEqual({
        status: "refused",
        reason: "server_refused",
      });
      expect(rig.handle.state().pendingDifficulty).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("solo with no echo in 2 s settles unconfirmed_solo and the store holds the change until the next body", async () => {
    jest.useFakeTimers();
    const rig = rigIn(SOLO);
    try {
      const pending = rig.handle.act.setDifficulty(dungeon(1));
      jest.advanceTimersByTime(1999);
      expect(rig.handle.state().pendingDifficulty).toBeUndefined();
      jest.advanceTimersByTime(1);
      expect(await pending).toEqual({ status: "unconfirmed_solo" });
      expect(rig.handle.state().pendingDifficulty).toEqual({
        kind: "dungeon",
        value: 1,
      });
      rig.inject(
        GameOpcode.MSG_SET_DUNGEON_DIFFICULTY,
        instancesDifficultyBody({ difficulty: 1, inGroup: false }),
      );
      expect(rig.handle.state().pendingDifficulty).toBeUndefined();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a leader in a group with no echo settles no_answer and holds nothing", async () => {
    jest.useFakeTimers();
    const rig = rigIn(LEADING);
    try {
      const pending = rig.handle.act.setDifficulty(dungeon(1));
      jest.advanceTimersByTime(2000);
      expect(await pending).toEqual({ status: "no_answer" });
      expect(rig.handle.state().pendingDifficulty).toBeUndefined();
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a second act in flight refuses busy", async () => {
    const rig = rigIn(SOLO);
    try {
      const first = rig.handle.act.setDifficulty(dungeon(1));
      expect(await rig.handle.act.setDifficulty(raid(1))).toEqual({
        status: "refused",
        reason: "busy",
      });
      expect(await rig.handle.act.resetInstances()).toEqual({
        status: "refused",
        reason: "busy",
      });
      expect(rig.sent).toHaveLength(1);
      rig.inject(
        GameOpcode.MSG_SET_DUNGEON_DIFFICULTY,
        instancesDifficultyBody({ difficulty: 1, inGroup: false }),
      );
      await first;
    } finally {
      rig.dispose();
    }
  });

  test("dispose rejects a pending request and releases its timer", async () => {
    jest.useFakeTimers();
    const rig = rigIn(SOLO);
    try {
      const pending = rig.handle.act.setDifficulty(dungeon(1));
      rig.dispose();
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test("a failed send rejects and leaves no timer behind", async () => {
    jest.useFakeTimers();
    const rig = rigIn(SOLO);
    try {
      Object.freeze(rig.sent);
      await expect(rig.handle.act.setDifficulty(dungeon(1))).rejects.toThrow();
      expect(jest.getTimerCount()).toBe(0);
      expect(rig.handle.state().pendingDifficulty).toBeUndefined();
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });
});

describe("instances runtime: resetInstances", () => {
  test("a group member who is not the leader refuses not_leader (MiscHandler.cpp:1261)", async () => {
    const rig = rigIn(FOLLOWING);
    try {
      expect(await rig.handle.act.resetInstances()).toEqual({
        status: "refused",
        reason: "not_leader",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("solo at heroic dungeon difficulty refuses heroic_no_reset (PlayerMisc.cpp:200-201)", async () => {
    const rig = rigIn(SOLO);
    try {
      rig.inject(
        GameOpcode.MSG_SET_DUNGEON_DIFFICULTY,
        instancesDifficultyBody({ difficulty: 1, inGroup: false }),
      );
      expect(await rig.handle.act.resetInstances()).toEqual({
        status: "refused",
        reason: "heroic_no_reset",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a group leader at heroic difficulty still sends", async () => {
    jest.useFakeTimers();
    const rig = rigIn(LEADING);
    try {
      rig.inject(
        GameOpcode.MSG_SET_DUNGEON_DIFFICULTY,
        instancesDifficultyBody({ difficulty: 1, inGroup: true }),
      );
      const pending = rig.handle.act.resetInstances();
      expect(opcodes(rig)).toEqual([GameOpcode.CMSG_RESET_INSTANCES]);
      jest.advanceTimersByTime(2000);
      expect(await pending).toEqual({ status: "nothing_to_reset" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("collects every reset packet for 2 s and settles ok with the maps", async () => {
    jest.useFakeTimers();
    const rig = rigIn(SOLO);
    try {
      const pending = rig.handle.act.resetInstances();
      expect(rig.sent).toEqual([
        {
          opcode: GameOpcode.CMSG_RESET_INSTANCES,
          body: buildResetInstances(),
        },
      ]);
      rig.inject(GameOpcode.SMSG_INSTANCE_RESET, instancesResetBody(36));
      jest.advanceTimersByTime(1000);
      rig.inject(
        GameOpcode.SMSG_RESET_FAILED_NOTIFY,
        instancesResetFailedNotifyBody(34),
      );
      rig.inject(
        GameOpcode.SMSG_INSTANCE_RESET_FAILED,
        instancesResetFailedBody({ reason: 0, mapId: 34 }),
      );
      rig.inject(
        GameOpcode.SMSG_INSTANCE_RESET_FAILED,
        instancesResetFailedBody({ reason: 0, mapId: 47 }),
      );
      jest.advanceTimersByTime(999);
      let settled = false;
      pending.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      jest.advanceTimersByTime(1);
      expect(await pending).toEqual({
        status: "ok",
        reset: [36],
        failed: [34, 47],
      });
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a blocked notice with no failure packet still counts as failed", async () => {
    jest.useFakeTimers();
    const rig = rigIn(SOLO);
    try {
      const pending = rig.handle.act.resetInstances();
      rig.inject(
        GameOpcode.SMSG_RESET_FAILED_NOTIFY,
        instancesResetFailedNotifyBody(36),
      );
      jest.advanceTimersByTime(2000);
      expect(await pending).toEqual({ status: "ok", reset: [], failed: [36] });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("no packet in 2 s settles nothing_to_reset and frees the act", async () => {
    jest.useFakeTimers();
    const rig = rigIn(SOLO);
    try {
      const pending = rig.handle.act.resetInstances();
      jest.advanceTimersByTime(2000);
      expect(await pending).toEqual({ status: "nothing_to_reset" });
      const again = rig.handle.act.resetInstances();
      jest.advanceTimersByTime(2000);
      expect(await again).toEqual({ status: "nothing_to_reset" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("dispose rejects a collecting reset and releases its timer", async () => {
    jest.useFakeTimers();
    const rig = rigIn(SOLO);
    try {
      const pending = rig.handle.act.resetInstances();
      rig.dispose();
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test("a failed send rejects and leaves no timer behind", async () => {
    jest.useFakeTimers();
    const rig = rigIn(SOLO);
    try {
      Object.freeze(rig.sent);
      await expect(rig.handle.act.resetInstances()).rejects.toThrow();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });
});
