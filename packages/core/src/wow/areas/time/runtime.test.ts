import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { timeQueryResponseBody } from "#test-support/areas/time";
import { GameOpcode } from "#wow/protocol/opcodes";

const HOME = { mapId: 530, x: 1, y: 2, z: 3, orientation: 0 };
const REPLY = timeQueryResponseBody({
  serverTime: 1_790_000_000,
  dailyResetInSec: 3600,
});

function queries(sent: readonly { opcode: number }[]) {
  return sent.filter((p) => p.opcode === GameOpcode.CMSG_QUERY_TIME);
}

describe("time runtime", () => {
  test("query sends an empty CMSG_QUERY_TIME and resolves with the reply state", async () => {
    const rig = areaRig("time", { now: () => 9 });
    try {
      const pending = rig.handle.act.query();
      expect(rig.sent).toEqual([
        { opcode: GameOpcode.CMSG_QUERY_TIME, body: new Uint8Array() },
      ]);
      rig.inject(GameOpcode.SMSG_QUERY_TIME_RESPONSE, REPLY);
      expect(await pending).toMatchObject({
        serverTime: 1_790_000_000,
        dailyResetInSec: 3600,
        receivedAt: 9,
      });
    } finally {
      rig.dispose();
    }
  });

  test("query rejects timeout after 5 s with no reply", async () => {
    jest.useFakeTimers();
    const rig = areaRig("time");
    try {
      const pending = rig.handle.act.query();
      const settled = pending.then(
        () => "resolved",
        (error: Error) => error.message,
      );
      jest.advanceTimersByTime(4999);
      rig.inject(GameOpcode.SMSG_LOGIN_SETTIMESPEED, new Uint8Array(12));
      jest.advanceTimersByTime(1);
      expect(await settled).toBe("timeout");
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("login_verified sends one CMSG_QUERY_TIME", async () => {
    const rig = areaRig("time");
    try {
      rig.stores.self.receive({ type: "login_verified", position: HOME });
      expect(queries(rig.sent)).toHaveLength(1);
      rig.stores.self.receive({ type: "new_world", position: HOME });
      expect(queries(rig.sent)).toHaveLength(1);
      rig.inject(GameOpcode.SMSG_QUERY_TIME_RESPONSE, REPLY);
      expect(rig.handle.state().dailyResetInSec).toBe(3600);
    } finally {
      rig.dispose();
    }
  });

  test("dispose rejects a pending query with the abort reason and stops the login query", async () => {
    const rig = areaRig("time");
    const pending = rig.handle.act.query();
    rig.dispose();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    rig.stores.self.receive({ type: "login_verified", position: HOME });
    expect(queries(rig.sent)).toHaveLength(1);
  });
});
