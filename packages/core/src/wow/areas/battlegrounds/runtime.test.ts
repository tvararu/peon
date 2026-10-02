import { describe, expect, jest, test } from "bun:test";
import {
  BG_ME,
  battlegroundsBattlefieldListBody,
  battlegroundsGroupJoinedBody,
  battlegroundsInspectHonorStatsBody,
  battlegroundsScene,
  battlegroundsStatusBody,
  battlegroundsStatusNoneBody,
} from "#test-support/areas/battlegrounds";
import { GameOpcode } from "#wow/protocol/opcodes";

describe("battlegrounds acts", () => {
  test("act.setPvp sends CMSG_TOGGLE_PVP and resolves on the matching pvp_flag (Handlers/MiscHandler.cpp:500-519)", async () => {
    const { rig, update } = battlegroundsScene();
    try {
      const pending = rig.handle.act.setPvp(true);
      const sent = rig.sent.at(-1);
      expect(sent?.opcode).toBe(GameOpcode.CMSG_TOGGLE_PVP);
      expect([...(sent?.body ?? [])]).toEqual([1]);
      update(BG_ME, { byte2: 0x01_00, playerFlags: 0x2_00 });
      const result = await pending;
      expect(result).toEqual({ kind: "set", on: true });
    } finally {
      rig.dispose();
    }
  });

  test("act.setPvp resolves without sending when the flag already matches", async () => {
    const { rig, update } = battlegroundsScene();
    try {
      await rig.handle.act.setPvp(false);
      const before = rig.sent.length;
      const result = await rig.handle.act.setPvp(false);
      expect(result).toEqual({ kind: "set", on: false });
      expect(rig.sent.length).toBe(before);
      void update;
    } finally {
      rig.dispose();
    }
  });

  test("act.setPvp rejects timeout with no update in 3 s (fake timers)", async () => {
    jest.useFakeTimers();
    const { rig } = battlegroundsScene();
    try {
      const pending = rig.handle.act.setPvp(true);
      jest.advanceTimersByTime(3000);
      await expect(pending).rejects.toThrow("timeout");
    } finally {
      jest.useRealTimers();
      rig.dispose();
    }
  });

  test("act.inspectHonor sends MSG_INSPECT_HONOR_STATS and resolves on that guid", async () => {
    const { rig } = battlegroundsScene();
    try {
      const pending = rig.handle.act.inspectHonor(BG_ME);
      const sent = rig.sent.at(-1);
      expect(sent?.opcode).toBe(GameOpcode.MSG_INSPECT_HONOR_STATS);
      rig.inject(
        GameOpcode.MSG_INSPECT_HONOR_STATS,
        battlegroundsInspectHonorStatsBody({
          guid: BG_ME,
          honor: 12,
          kills: 3,
          lifetime: 44,
          today: 7,
          yesterday: 9,
        }),
      );
      const result = await pending;
      expect(result).toEqual({
        guid: BG_ME,
        honor: 12,
        kills: 3,
        lifetime: 44,
        today: 7,
        yesterday: 9,
      });
    } finally {
      rig.dispose();
    }
  });

  test("act.inspectHonor rejects no_answer after 3 s of silence (fake timers)", async () => {
    jest.useFakeTimers();
    const { rig } = battlegroundsScene();
    try {
      const pending = rig.handle.act.inspectHonor(0x0c_00n);
      jest.advanceTimersByTime(3000);
      await expect(pending).rejects.toThrow("no_answer");
    } finally {
      jest.useRealTimers();
      rig.dispose();
    }
  });
});

type Scene = ReturnType<typeof battlegroundsScene>;

function injectStatus(
  scene: Scene,
  init: Parameters<typeof battlegroundsStatusBody>[0],
): void {
  scene.rig.inject(
    GameOpcode.SMSG_BATTLEFIELD_STATUS,
    battlegroundsStatusBody(init),
  );
}

describe("battlegrounds queue acts (Handlers/BattleGroundHandler.cpp:37-86,368-430,637-696)", () => {
  test("login_verified and new_world each send one empty CMSG_BATTLEFIELD_STATUS and other self events send nothing", () => {
    const { rig } = battlegroundsScene();
    try {
      const position = { mapId: 0, orientation: 0, x: 0, y: 0, z: 0 };
      rig.stores.self.receive({ position, type: "login_verified" });
      rig.stores.self.receive({ position, type: "new_world" });
      const sent = rig.sent.filter(
        (p) => p.opcode === GameOpcode.CMSG_BATTLEFIELD_STATUS,
      );
      expect(sent).toHaveLength(2);
      expect(sent.every((p) => p.body.length === 0)).toBe(true);
      expect(rig.sent).toHaveLength(2);
    } finally {
      rig.dispose();
    }
  });

  test("act.list sends CMSG_BATTLEFIELD_LIST and resolves on that battleground's list", async () => {
    const { rig } = battlegroundsScene();
    try {
      const pending = rig.handle.act.list(2);
      const sent = rig.sent.at(-1);
      expect(sent?.opcode).toBe(GameOpcode.CMSG_BATTLEFIELD_LIST);
      expect([...(sent?.body ?? [])].slice(0, 4)).toEqual([2, 0, 0, 0]);
      rig.inject(
        GameOpcode.SMSG_BATTLEFIELD_LIST,
        battlegroundsBattlefieldListBody({
          bgType: 2,
          fromWhere: 1,
          guid: 0n,
          instances: [3],
        }),
      );
      expect(await pending).toMatchObject({ bgType: 2, instances: [3] });
    } finally {
      rig.dispose();
    }
  });

  test("act.list ignores a list for another battleground and rejects timeout after 3 s", async () => {
    jest.useFakeTimers();
    const { rig } = battlegroundsScene();
    try {
      const pending = rig.handle.act.list(2);
      rig.inject(
        GameOpcode.SMSG_BATTLEFIELD_LIST,
        battlegroundsBattlefieldListBody({ bgType: 3, fromWhere: 1, guid: 0n }),
      );
      jest.advanceTimersByTime(3000);
      await expect(pending).rejects.toThrow("timeout");
    } finally {
      jest.useRealTimers();
      rig.dispose();
    }
  });

  test("act.hello sends CMSG_BATTLEMASTER_HELLO and resolves on the list from that master", async () => {
    const { rig } = battlegroundsScene();
    try {
      const pending = rig.handle.act.hello(0x0d_00n);
      expect(rig.sent.at(-1)?.opcode).toBe(GameOpcode.CMSG_BATTLEMASTER_HELLO);
      rig.inject(
        GameOpcode.SMSG_BATTLEFIELD_LIST,
        battlegroundsBattlefieldListBody({
          bgType: 2,
          fromWhere: 0,
          guid: 0x0d_00n,
        }),
      );
      expect(await pending).toMatchObject({ guid: 0x0d_00n });
    } finally {
      rig.dispose();
    }
  });

  test("act.join sends guid 0 by default and resolves on a queued status for that battleground", async () => {
    const scene = battlegroundsScene();
    try {
      const pending = scene.rig.handle.act.join(2);
      const sent = scene.rig.sent.at(-1);
      expect(sent?.opcode).toBe(GameOpcode.CMSG_BATTLEMASTER_JOIN);
      expect([...(sent?.body ?? [])]).toEqual([
        0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0,
      ]);
      injectStatus(scene, { avgWait: 1, bgType: 3, slot: 1, status: 1 });
      injectStatus(scene, { avgWait: 9, bgType: 2, slot: 0, status: 1 });
      expect(await pending).toMatchObject({
        slot: 0,
        status: { avgWaitMs: 9, bgType: 2, kind: "queued" },
      });
    } finally {
      scene.rig.dispose();
    }
  });

  test("act.join passes via, instance and the group flag", () => {
    const { rig } = battlegroundsScene();
    try {
      void rig.handle.act
        .join(3, { asGroup: true, instanceId: 7, via: 0x0d_00n })
        .catch(() => undefined);
      const body = [...(rig.sent.at(-1)?.body ?? [])];
      expect(body.slice(0, 2)).toEqual([0, 0x0d]);
      expect(body.slice(8, 13)).toEqual([3, 0, 0, 0, 7]);
      expect(body.at(-1)).toBe(1);
    } finally {
      rig.dispose();
    }
  });

  test("act.join rejects with the error name of SMSG_GROUP_JOINED_BATTLEGROUND", async () => {
    const { rig } = battlegroundsScene();
    try {
      const pending = rig.handle.act.join(2);
      rig.inject(
        GameOpcode.SMSG_GROUP_JOINED_BATTLEGROUND,
        battlegroundsGroupJoinedBody(-2),
      );
      await expect(pending).rejects.toThrow("deserter");
    } finally {
      rig.dispose();
    }
  });

  test("act.join keeps waiting through a positive group result and rejects timeout after 5 s of silence", async () => {
    jest.useFakeTimers();
    const { rig } = battlegroundsScene();
    try {
      const pending = rig.handle.act.join(2);
      rig.inject(
        GameOpcode.SMSG_GROUP_JOINED_BATTLEGROUND,
        battlegroundsGroupJoinedBody(2),
      );
      jest.advanceTimersByTime(4999);
      jest.advanceTimersByTime(1);
      await expect(pending).rejects.toThrow("timeout");
    } finally {
      jest.useRealTimers();
      rig.dispose();
    }
  });

  test("a pending join rejects when the area is disposed", async () => {
    const { rig } = battlegroundsScene();
    const pending = rig.handle.act.join(2);
    rig.dispose();
    await expect(pending).rejects.toThrow();
  });

  test("act.answer on an empty slot rejects no_slot and sends nothing", async () => {
    const { rig } = battlegroundsScene();
    try {
      await expect(rig.handle.act.answer(0, false)).rejects.toThrow("no_slot");
      expect(rig.sent).toHaveLength(0);
    } finally {
      rig.dispose();
    }
  });

  test("act.leaveQueue echoes the slot's arena type and battleground and resolves on the none status", async () => {
    const scene = battlegroundsScene();
    try {
      injectStatus(scene, {
        arenaType: 2,
        bgType: 3,
        isArena: 0x0e,
        slot: 1,
        status: 1,
      });
      const pending = scene.rig.handle.act.leaveQueue(1);
      const sent = scene.rig.sent.at(-1);
      expect(sent?.opcode).toBe(GameOpcode.CMSG_BATTLEFIELD_PORT);
      expect([...(sent?.body ?? [])]).toEqual([
        2, 0, 3, 0, 0, 0, 0x90, 0x1f, 0,
      ]);
      scene.rig.inject(
        GameOpcode.SMSG_BATTLEFIELD_STATUS,
        battlegroundsStatusNoneBody(1),
      );
      expect(await pending).toEqual({ kind: "none", slot: 1 });
    } finally {
      scene.rig.dispose();
    }
  });

  test("act.answer accepting an invitation sends action 1 and resolves on active", async () => {
    const scene = battlegroundsScene();
    try {
      injectStatus(scene, {
        bgType: 2,
        mapId: 489,
        slot: 0,
        status: 2,
        timeToRemove: 60_000,
      });
      const pending = scene.rig.handle.act.answer(0, true);
      expect(scene.rig.sent.at(-1)?.body.at(-1)).toBe(1);
      injectStatus(scene, { bgType: 2, mapId: 489, slot: 0, status: 3 });
      expect(await pending).toEqual({ kind: "active", slot: 0 });
    } finally {
      scene.rig.dispose();
    }
  });

  test("act.leaveQueue refuses an invited slot so no desertion is recorded", async () => {
    const scene = battlegroundsScene();
    try {
      injectStatus(scene, { bgType: 2, mapId: 489, slot: 0, status: 2 });
      await expect(scene.rig.handle.act.leaveQueue(0)).rejects.toThrow(
        "not_queued",
      );
      expect(scene.rig.sent).toHaveLength(0);
    } finally {
      scene.rig.dispose();
    }
  });

  test("act.answer and act.leaveQueue reject in_combat and send nothing (Handlers/BattleGroundHandler.cpp:419-423)", async () => {
    const scene = battlegroundsScene();
    try {
      injectStatus(scene, { bgType: 2, slot: 0, status: 1 });
      scene.update(BG_ME, { unitFlags: 0x8_00_00 });
      await expect(scene.rig.handle.act.leaveQueue(0)).rejects.toThrow(
        "in_combat",
      );
      await expect(scene.rig.handle.act.answer(0, false)).rejects.toThrow(
        "in_combat",
      );
      expect(scene.rig.sent).toHaveLength(0);
    } finally {
      scene.rig.dispose();
    }
  });

  test("act.answer rejects timeout after 10 s when the server stays silent", async () => {
    jest.useFakeTimers();
    const scene = battlegroundsScene();
    try {
      injectStatus(scene, { bgType: 2, slot: 0, status: 1 });
      const pending = scene.rig.handle.act.leaveQueue(0);
      jest.advanceTimersByTime(10_000);
      await expect(pending).rejects.toThrow("timeout");
    } finally {
      jest.useRealTimers();
      scene.rig.dispose();
    }
  });
});
