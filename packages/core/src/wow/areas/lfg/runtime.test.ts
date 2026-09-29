import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  lfgPartyInfoBody,
  lfgPlayerInfoBody,
  lfgUpdatePartyBody,
  lfgUpdatePlayerBody,
} from "#test-support/areas/lfg";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import type { PartyMember } from "#wow/party-store";
import { GameOpcode } from "#wow/protocol/opcodes";

const PLAYER = lfgUpdatePlayerBody({
  updateType: 5,
  data: { queued: true, dungeons: [0x01_00_00_12] },
});
const PARTY = lfgUpdatePartyBody({
  updateType: 14,
  data: { join: true, queued: true, dungeons: [0x01_00_00_12] },
});
const INFO = lfgPlayerInfoBody({
  random: [{ entry: 0x01_00_00_12 }],
  locks: [{ entry: 0x01_00_00_12, status: 2 }],
});

function member(name: string, guid: bigint): PartyMember {
  return {
    name,
    guid,
    online: true,
    health: null,
    maxHealth: null,
    level: null,
    statsAt: null,
    source: null,
  };
}

function solo() {
  return areaRig("lfg", {
    legacy: {
      party: () => ({ inGroup: false, leader: null, loot: null, members: [] }),
      friends: () => [],
      ignored: () => [],
      guild: () => undefined,
      channels: () => [],
    },
  });
}

function grouped() {
  return areaRig("lfg", {
    legacy: {
      party: () => ({
        inGroup: true,
        leader: null,
        loot: null,
        members: [member("Partner", 0xden)],
      }),
      friends: () => [],
      ignored: () => [],
      guild: () => undefined,
      channels: () => [],
    },
  });
}

function sentOpcode(
  rig: { sent: readonly { opcode: number }[] },
  opcode: number,
) {
  return rig.sent.filter((p) => p.opcode === opcode);
}

describe("lfg runtime", () => {
  test("requestStatus sends CMSG_LFG_GET_STATUS and settles ok after one update solo", async () => {
    const rig = solo();
    try {
      const pending = rig.handle.act.requestStatus();
      expect(sentOpcode(rig, GameOpcode.CMSG_LFG_GET_STATUS)).toHaveLength(1);
      rig.inject(GameOpcode.SMSG_LFG_UPDATE_PARTY, PARTY);
      rig.inject(GameOpcode.SMSG_LFG_UPDATE_PLAYER, PLAYER);
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("requestStatus waits for both updates in a group", async () => {
    const rig = grouped();
    try {
      const pending = rig.handle.act.requestStatus();
      rig.inject(GameOpcode.SMSG_LFG_UPDATE_PLAYER, PLAYER);
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      rig.inject(GameOpcode.SMSG_LFG_UPDATE_PARTY, PARTY);
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("requestDungeons settles ok with available and locks", async () => {
    const rig = solo();
    try {
      const pending = rig.handle.act.requestDungeons();
      expect(
        sentOpcode(rig, GameOpcode.CMSG_LFD_PLAYER_LOCK_INFO_REQUEST),
      ).toHaveLength(1);
      rig.inject(GameOpcode.SMSG_LFG_PLAYER_INFO, INFO);
      const result = await pending;
      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.available).toEqual([{ entry: 0x01_00_00_12, id: 18 }]);
        expect(result.locks).toHaveLength(1);
      }
    } finally {
      rig.dispose();
    }
  });

  test("requestDungeons settles no_answer after 5 s with no reply", async () => {
    await withFakeTimers(async () => {
      const rig = solo();
      try {
        const pending = rig.handle.act.requestDungeons();
        const assertion = pending.then((result) =>
          expect(result).toEqual({ status: "no_answer" }),
        );
        await elapse(5100);
        await assertion;
      } finally {
        rig.dispose();
      }
    });
  });

  test("requestPartyLocks without a group refuses not_in_group and sends nothing", async () => {
    const rig = solo();
    try {
      expect(await rig.handle.act.requestPartyLocks()).toEqual({
        status: "refused",
        reason: "not_in_group",
      });
      expect(
        sentOpcode(rig, GameOpcode.CMSG_LFD_PARTY_LOCK_INFO_REQUEST),
      ).toHaveLength(0);
    } finally {
      rig.dispose();
    }
  });

  test("requestPartyLocks settles ok in a group", async () => {
    const rig = grouped();
    try {
      const pending = rig.handle.act.requestPartyLocks();
      rig.inject(
        GameOpcode.SMSG_LFG_PARTY_INFO,
        lfgPartyInfoBody([{ guid: 0xden, locks: [] }]),
      );
      const result = await pending;
      expect(result.status).toBe("ok");
    } finally {
      rig.dispose();
    }
  });

  test("one LFG act at a time refuses busy", async () => {
    const rig = solo();
    try {
      const first = rig.handle.act.requestDungeons();
      expect(await rig.handle.act.requestStatus()).toEqual({
        status: "refused",
        reason: "busy",
      });
      rig.inject(GameOpcode.SMSG_LFG_PLAYER_INFO, INFO);
      expect((await first).status).toBe("ok");
    } finally {
      rig.dispose();
    }
  });

  describe("when the world socket is down", () => {
    const acts = {
      requestDungeons: solo,
      requestPartyLocks: grouped,
      requestStatus: solo,
    } as const;

    for (const [name, make] of Object.entries(acts)) {
      test(`${name} rejects with the send error and leaves no waiter behind`, async () => {
        await withFakeTimers(async () => {
          const unhandled: unknown[] = [];
          const listener = (reason: unknown) => unhandled.push(reason);
          process.on("unhandledRejection", listener);
          const rig = make();
          try {
            (rig.sent as unknown[]).push = () => {
              throw new Error("socket down");
            };
            const act = rig.handle.act[name as keyof typeof acts];
            await expect(act()).rejects.toThrow("socket down");
            await elapse(5100);
            await Promise.resolve();
            expect(unhandled).toEqual([]);
          } finally {
            process.off("unhandledRejection", listener);
            rig.dispose();
          }
        });
      });
    }
  });
});
