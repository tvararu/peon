import { describe, expect, test } from "bun:test";
import { unitmotionSplineToggleBody } from "#test-support/areas/unitmotion";
import {
  info,
  motionFixture,
  moveBody,
  PEER,
} from "#test-support/remote-motion-fixtures";
import { writePackedGuid } from "#test-support/world-handlers-fixtures";
import { MovementFlag } from "#wow/protocol/entity-fields";
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

describe("remote motion handlers re-classify a player pose on spline toggles", () => {
  test("root and swim toggles move the pose between valid and invalid", async () => {
    const f = await motionFixture();
    try {
      const body = unitmotionSplineToggleBody({ guid: PEER });
      await f.inject(
        GameOpcode.MSG_MOVE_START_FORWARD,
        moveBody(PEER, info(1, MovementFlag.FORWARD)),
      );
      expect(f.pose()?.motion).toBe("moving");
      await f.inject(GameOpcode.SMSG_SPLINE_MOVE_ROOT, body);
      expect(f.pose()).toMatchObject({
        flags: MovementFlag.ROOT,
        motion: "stationary",
      });
      await f.inject(GameOpcode.SMSG_SPLINE_MOVE_UNROOT, body);
      expect(f.pose()).toMatchObject({ flags: 0, motion: "stationary" });
      await f.inject(GameOpcode.SMSG_SPLINE_MOVE_START_SWIM, body);
      expect(f.pose()).toMatchObject({
        flags: MovementFlag.SWIMMING,
        invalid: "swimming",
      });
      await f.inject(GameOpcode.SMSG_SPLINE_MOVE_STOP_SWIM, body);
      expect(f.pose()).toMatchObject({ flags: 0, motion: "stationary" });
      expect(f.pose()?.invalid).toBeUndefined();
      expect(f.errors).toEqual([]);
    } finally {
      await f.close();
    }
  });

  test("a toggle keeps the observer's movement bits it does not change", async () => {
    const f = await motionFixture();
    try {
      await f.inject(
        GameOpcode.MSG_MOVE_START_FORWARD,
        moveBody(PEER, info(1, MovementFlag.FORWARD)),
      );
      await f.inject(
        GameOpcode.SMSG_SPLINE_MOVE_SET_WALK_MODE,
        unitmotionSplineToggleBody({ guid: PEER }),
      );
      expect(f.pose()).toMatchObject({
        flags: MovementFlag.FORWARD | MovementFlag.WALKING,
        motion: "moving",
      });
    } finally {
      await f.close();
    }
  });

  test("a toggle for a guid with no pose leaves poses alone", async () => {
    const f = await motionFixture();
    try {
      const before = f.pose();
      await f.inject(
        GameOpcode.SMSG_SPLINE_MOVE_ROOT,
        unitmotionSplineToggleBody({ guid: 0x77n }),
      );
      expect(f.pose()).toEqual(before);
      expect(f.errors).toEqual([]);
    } finally {
      await f.close();
    }
  });
});
