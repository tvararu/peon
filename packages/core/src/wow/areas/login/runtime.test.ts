import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { GameOpcode } from "#wow/protocol/opcodes";

const EMPTY = new Uint8Array(0);

describe("login runtime", () => {
  test("keepAlive sends one empty CMSG_KEEP_ALIVE (WorldSocket.cpp:452-462)", () => {
    const rig = areaRig("login");
    try {
      rig.handle.act.keepAlive();
      expect(rig.sent).toEqual([
        { body: EMPTY, opcode: GameOpcode.CMSG_KEEP_ALIVE },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("cancelLogout sends one CMSG_LOGOUT_CANCEL and resolves on the ack (MiscHandler.cpp:480-497)", async () => {
    const rig = areaRig("login");
    try {
      const pending = rig.handle.act.cancelLogout();
      expect(rig.sent).toEqual([
        { body: EMPTY, opcode: GameOpcode.CMSG_LOGOUT_CANCEL },
      ]);
      rig.inject(GameOpcode.SMSG_LOGOUT_CANCEL_ACK, EMPTY);
      expect(await pending).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("cancelLogout rejects timeout after 5 s with no ack", async () => {
    jest.useFakeTimers();
    const rig = areaRig("login");
    try {
      const settled = rig.handle.act.cancelLogout().then(
        () => "resolved",
        (error: Error) => error.message,
      );
      jest.advanceTimersByTime(5000);
      expect(await settled).toBe("timeout");
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("playerLogout sends one empty CMSG_PLAYER_LOGOUT at once (MiscHandler.cpp:476-478)", () => {
    const rig = areaRig("login");
    try {
      expect(rig.handle.act.playerLogout()).toBeUndefined();
      expect(rig.sent).toEqual([
        { body: EMPTY, opcode: GameOpcode.CMSG_PLAYER_LOGOUT },
      ]);
    } finally {
      rig.dispose();
    }
  });
});
