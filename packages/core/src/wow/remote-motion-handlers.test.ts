import { describe, expect, test } from "bun:test";
import {
  info,
  motionFixture,
  PEER,
} from "#test-support/remote-motion-fixtures";
import { writePackedGuid } from "#test-support/world-handlers-fixtures";
import { writeMovementInfo } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";

function speedBody(speed: number): Uint8Array {
  const w = new PacketWriter();
  writePackedGuid(w, PEER);
  writeMovementInfo(w, info(1));
  w.floatLE(speed);
  return w.finish();
}

describe("remote motion handlers feed unit speeds", () => {
  test("MSG_MOVE_SET_RUN_SPEED from another player reaches the store as a move_msg run speed", async () => {
    const f = await motionFixture();
    try {
      f.setNow(12_000);
      await f.inject(GameOpcode.MSG_MOVE_SET_RUN_SPEED, speedBody(3.5));
      const row = f.handle.unitmotion
        .state()
        .units.find((unit) => unit.guid === PEER);
      expect(row?.speeds.run).toEqual({
        value: 3.5,
        source: "move_msg",
        at: 12_000,
      });
      expect(row?.serverControlled).toBe(false);
      expect(f.errors).toEqual([]);
    } finally {
      await f.close();
    }
  });

  test("MSG_MOVE_SET_PITCH_RATE lands on the pitch kind", async () => {
    const f = await motionFixture();
    try {
      await f.inject(GameOpcode.MSG_MOVE_SET_PITCH_RATE, speedBody(1.5));
      const row = f.handle.unitmotion
        .state()
        .units.find((unit) => unit.guid === PEER);
      expect(row?.speeds.pitch?.value).toBe(1.5);
      expect(row?.speeds.run?.source).toBe("create");
    } finally {
      await f.close();
    }
  });
});
