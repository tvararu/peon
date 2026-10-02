import { describe, expect, jest, test } from "bun:test";
import {
  BG_ME,
  battlegroundsInspectHonorStatsBody,
  battlegroundsScene,
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
