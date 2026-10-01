import { describe, expect, jest, test } from "bun:test";
import { decodeMove, setup } from "#test-support/control-fixtures";
import { must } from "#test-support/must";
import type { ControlRuntime } from "#wow/control";
import { MovementFlag } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";

const SELF = 0x0764n;

function flying() {
  const rig = setup();
  rig.runtime.setCanFly(5, true);
  rig.runtime.setFlying(true);
  rig.sent.length = 0;
  return rig;
}

describe("ControlRuntime.setSwimming (AC Handlers/MovementHandler.cpp:362-414)", () => {
  test("start sends MSG_MOVE_START_SWIM with SWIMMING and a pitch, stop clears both", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    runtime.setSwimming(true);
    runtime.setSwimming(false);
    const [start, stop] = sent.map(decodeMove);
    expect(must(start).opcode).toBe(GameOpcode.MSG_MOVE_START_SWIM);
    expect(must(start).guid).toBe(SELF);
    expect(must(start).flags & MovementFlag.SWIMMING).toBe(
      MovementFlag.SWIMMING,
    );
    expect(must(start).pitch).toBe(0);
    expect(must(stop).opcode).toBe(GameOpcode.MSG_MOVE_STOP_SWIM);
    expect(must(stop).flags & MovementFlag.SWIMMING).toBe(0);
    expect(must(stop).pitch).toBeUndefined();
    expect(sent).toHaveLength(2);
  });

  test("repeating the current state sends nothing", () => {
    const { runtime, sent } = setup();
    runtime.setSwimming(false);
    runtime.setSwimming(true);
    sent.length = 0;
    runtime.setSwimming(true);
    expect(sent).toHaveLength(0);
  });

  test("the SWIMMING bit follows the explicit swim state in later moves", () => {
    jest.useFakeTimers();
    try {
      const { runtime, sent } = setup();
      runtime.setSwimming(true);
      sent.length = 0;
      runtime.setSwimming(false);
      runtime.move("forward", 2000);
      const start = decodeMove(sent.at(-1));
      expect(start.opcode).toBe(GameOpcode.MSG_MOVE_START_FORWARD);
      expect(start.flags & MovementFlag.SWIMMING).toBe(0);
      runtime.halt();
    } finally {
      jest.useRealTimers();
    }
  });

  test("a walking character is stopped before the swim starts", () => {
    jest.useFakeTimers();
    try {
      const { runtime, sent } = setup();
      runtime.move("forward", 2000);
      sent.length = 0;
      runtime.setSwimming(true);
      const [stop, swim] = sent.map(decodeMove);
      expect(must(stop).opcode).toBe(GameOpcode.MSG_MOVE_STOP);
      expect(must(swim).opcode).toBe(GameOpcode.MSG_MOVE_START_SWIM);
      expect(must(swim).flags & MovementFlag.FORWARD).toBe(0);
      expect(runtime.snapshot().moving).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test("a jump into the water ends the fall before the swim starts", () => {
    jest.useFakeTimers();
    try {
      const { runtime, sent } = setup();
      runtime.jump();
      expect(runtime.snapshot().airborne).toBe(true);
      sent.length = 0;
      runtime.setSwimming(true);
      const swim = decodeMove(sent.at(-1));
      expect(swim.opcode).toBe(GameOpcode.MSG_MOVE_START_SWIM);
      expect(swim.flags & MovementFlag.FALLING).toBe(0);
      expect(runtime.snapshot().airborne).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test("ground moves are refused while swimming", () => {
    const { runtime } = setup();
    runtime.setSwimming(true);
    expect(runtime.snapshot().blockedReason).toBe("swimming");
    expect(() => runtime.move("forward", 1000)).toThrow("swimming");
    runtime.setSwimming(false);
    expect(runtime.snapshot().blockedReason).toBeUndefined();
  });

  test("a world change ends the swim state and its pitch", () => {
    const { runtime, sent } = setup();
    runtime.setSwimming(true);
    runtime.pitch(0.4);
    runtime.newWorld({ mapId: 571, orientation: 0, x: 1, y: 2, z: 3 });
    sent.length = 0;
    runtime.setSwimming(true);
    const start = decodeMove(sent[0]);
    expect(start.pitch).toBe(0);
  });

  test.each([
    ["rooted", (r: ControlRuntime) => r.forceRoot(1)],
    [
      "no_control",
      (r: ControlRuntime) => r.clientControl({ guid: SELF, allow: false }),
    ],
    ["teleporting", (r: ControlRuntime) => r.handleTransferPending()],
  ])("is refused while %s and sends nothing", (reason, block) => {
    const rig = setup();
    block(rig.runtime);
    rig.sent.length = 0;
    expect(() => rig.runtime.setSwimming(true)).toThrow(reason);
    expect(rig.sent).toHaveLength(0);
    rig.runtime.dispose();
  });
});

describe("ControlRuntime.pitch", () => {
  test("is refused outside water and air", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    expect(() => runtime.pitch("up")).toThrow("not_swimming_or_flying");
    expect(sent).toHaveLength(0);
  });

  test("up, down and stop send the pitch messages with the PITCH bits", () => {
    const { runtime, sent } = setup();
    runtime.setSwimming(true);
    sent.length = 0;
    runtime.pitch("up");
    runtime.pitch("down");
    runtime.pitch("stop");
    const [up, down, stop] = sent.map(decodeMove);
    expect(must(up).opcode).toBe(GameOpcode.MSG_MOVE_START_PITCH_UP);
    expect(must(up).flags & MovementFlag.PITCH_UP).toBe(MovementFlag.PITCH_UP);
    expect(must(down).opcode).toBe(GameOpcode.MSG_MOVE_START_PITCH_DOWN);
    expect(must(down).flags & MovementFlag.PITCH_UP).toBe(0);
    expect(must(down).flags & MovementFlag.PITCH_DOWN).toBe(
      MovementFlag.PITCH_DOWN,
    );
    expect(must(stop).opcode).toBe(GameOpcode.MSG_MOVE_STOP_PITCH);
    expect(
      must(stop).flags & (MovementFlag.PITCH_UP | MovementFlag.PITCH_DOWN),
    ).toBe(0);
  });

  test("a number sends MSG_MOVE_SET_PITCH and stays in later messages", () => {
    const { runtime, sent } = setup();
    runtime.setSwimming(true);
    sent.length = 0;
    runtime.pitch(0.5);
    runtime.pitch("up");
    const [set, up] = sent.map(decodeMove);
    expect(must(set).opcode).toBe(GameOpcode.MSG_MOVE_SET_PITCH);
    expect(must(set).pitch).toBeCloseTo(0.5, 5);
    expect(must(up).pitch).toBeCloseTo(0.5, 5);
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY, 2, -2])(
    "rejects pitch %p without sending",
    (value) => {
      const { runtime, sent } = setup();
      runtime.setSwimming(true);
      sent.length = 0;
      expect(() => runtime.pitch(value)).toThrow("invalid_pitch");
      expect(sent).toHaveLength(0);
    },
  );

  test("leaving the water clears the PITCH bits", () => {
    const { runtime, sent } = setup();
    runtime.setSwimming(true);
    runtime.pitch("up");
    sent.length = 0;
    runtime.setSwimming(false);
    expect(
      decodeMove(sent[0]).flags &
        (MovementFlag.PITCH_UP | MovementFlag.PITCH_DOWN),
    ).toBe(0);
  });
});

describe("ControlRuntime.setFlying (AC Handlers/MovementHandler.cpp:362-414)", () => {
  test("is refused without CAN_FLY and sends nothing", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    expect(() => runtime.setFlying(true)).toThrow("cannot_fly");
    expect(sent).toHaveLength(0);
  });

  test("with CAN_FLY sends CMSG_MOVE_SET_FLY carrying FLYING, CAN_FLY and a pitch", () => {
    const { runtime, sent } = setup();
    runtime.setCanFly(5, true);
    sent.length = 0;
    runtime.setFlying(true);
    const fly = decodeMove(sent[0]);
    expect(fly.opcode).toBe(GameOpcode.CMSG_MOVE_SET_FLY);
    expect(fly.flags & MovementFlag.FLYING).toBe(MovementFlag.FLYING);
    expect(fly.flags & MovementFlag.CAN_FLY).toBe(MovementFlag.CAN_FLY);
    expect(fly.pitch).toBe(0);
    runtime.setFlying(false);
    const land = decodeMove(sent[1]);
    expect(land.opcode).toBe(GameOpcode.CMSG_MOVE_SET_FLY);
    expect(land.flags & MovementFlag.FLYING).toBe(0);
    expect(land.pitch).toBeUndefined();
  });

  test("the server taking CAN_FLY away ends the flight state", () => {
    const { runtime, sent } = flying();
    runtime.ascend("start");
    runtime.setCanFly(6, false);
    sent.length = 0;
    expect(() => runtime.ascend("stop")).toThrow("not_flying");
    expect(() => runtime.setFlying(true)).toThrow("cannot_fly");
    runtime.setSwimming(true);
    expect(decodeMove(sent.at(-1)).flags & MovementFlag.ASCENDING).toBe(0);
  });

  test("ground moves are refused while flying", () => {
    const { runtime } = flying();
    expect(() => runtime.move("forward", 1000)).toThrow("flying");
  });
});

describe("ControlRuntime.ascend and descend", () => {
  test("are refused when not flying", () => {
    const { runtime, sent } = setup();
    runtime.setCanFly(5, true);
    sent.length = 0;
    expect(() => runtime.ascend("start")).toThrow("not_flying");
    expect(() => runtime.descend()).toThrow("not_flying");
    expect(sent).toHaveLength(0);
  });

  test("start, stop and descend send their messages with the vertical bits", () => {
    const { runtime, sent } = flying();
    runtime.ascend("start");
    runtime.ascend("stop");
    runtime.descend();
    runtime.ascend("stop");
    const [start, stop, down, end] = sent.map(decodeMove);
    expect(must(start).opcode).toBe(GameOpcode.MSG_MOVE_START_ASCEND);
    expect(must(start).flags & MovementFlag.ASCENDING).toBe(
      MovementFlag.ASCENDING,
    );
    expect(must(stop).opcode).toBe(GameOpcode.MSG_MOVE_STOP_ASCEND);
    expect(must(stop).flags & MovementFlag.ASCENDING).toBe(0);
    expect(must(down).opcode).toBe(GameOpcode.MSG_MOVE_START_DESCEND);
    expect(must(down).flags & MovementFlag.DESCENDING).toBe(
      MovementFlag.DESCENDING,
    );
    expect(must(end).opcode).toBe(GameOpcode.MSG_MOVE_STOP_ASCEND);
    expect(must(end).flags & MovementFlag.DESCENDING).toBe(0);
    expect(must(start).flags & MovementFlag.FLYING).toBe(MovementFlag.FLYING);
  });

  test("a descend replaces a running ascend", () => {
    const { runtime, sent } = flying();
    runtime.ascend("start");
    runtime.descend();
    const down = decodeMove(sent.at(-1));
    expect(down.flags & MovementFlag.ASCENDING).toBe(0);
  });
});
