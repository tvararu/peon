import { describe, expect, test } from "bun:test";
import { decodeMove, setup } from "#test-support/control-fixtures";
import { must } from "#test-support/must";
import { MovementFlag } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";

function flying() {
  const rig = setup();
  rig.runtime.setCanFly(5, true);
  rig.runtime.setFlying(true);
  rig.sent.length = 0;
  return rig;
}

function swimming() {
  const rig = setup();
  rig.runtime.setSwimming(true);
  rig.sent.length = 0;
  return rig;
}

describe("explicit swim and fly changes over server-observed flags", () => {
  test("setSwimming(false) leaves observed swimming and sends STOP_SWIM", () => {
    const { runtime, sent } = setup();
    runtime.observeSelf({ movementFlags: MovementFlag.SWIMMING });
    sent.length = 0;
    runtime.setSwimming(false);
    const stop = decodeMove(sent[0]);
    expect(stop.opcode).toBe(GameOpcode.MSG_MOVE_STOP_SWIM);
    expect(stop.flags & MovementFlag.SWIMMING).toBe(0);
    expect(runtime.snapshot().blockedReason).toBeUndefined();
  });

  test("setSwimming(true) is idempotent over observed swimming", () => {
    const { runtime, sent } = setup();
    runtime.observeSelf({ movementFlags: MovementFlag.SWIMMING });
    sent.length = 0;
    runtime.setSwimming(true);
    expect(sent).toHaveLength(0);
  });

  test("true then false after observed swimming unblocks ground movement", () => {
    const { runtime } = setup();
    runtime.observeSelf({ movementFlags: MovementFlag.SWIMMING });
    runtime.setSwimming(true);
    runtime.setSwimming(false);
    expect(runtime.snapshot().blockedReason).toBeUndefined();
    runtime.move("forward", 500);
    expect(runtime.snapshot().moving).toBe(true);
    runtime.halt();
  });

  test("setFlying(false) leaves observed flying and sends the fly message", () => {
    const { runtime, sent } = setup();
    runtime.observeSelf({
      movementFlags: MovementFlag.FLYING | MovementFlag.CAN_FLY,
    });
    sent.length = 0;
    runtime.setFlying(false);
    const off = decodeMove(sent[0]);
    expect(off.opcode).toBe(GameOpcode.CMSG_MOVE_SET_FLY);
    expect(off.flags & MovementFlag.FLYING).toBe(0);
    expect(runtime.snapshot().blockedReason).toBeUndefined();
  });

  test("setFlying(true) is idempotent over observed flying", () => {
    const { runtime, sent } = setup();
    runtime.observeSelf({
      movementFlags: MovementFlag.FLYING | MovementFlag.CAN_FLY,
    });
    sent.length = 0;
    runtime.setFlying(true);
    expect(sent).toHaveLength(0);
  });
});

describe("air inputs follow halt and forced interruptions", () => {
  test("halt sends STOP_ASCEND for a running ascend and clears the bit", () => {
    const { runtime, sent } = flying();
    runtime.ascend("start");
    sent.length = 0;
    runtime.halt();
    const stop = decodeMove(sent[0]);
    expect(stop.opcode).toBe(GameOpcode.MSG_MOVE_STOP_ASCEND);
    expect(stop.flags & MovementFlag.ASCENDING).toBe(0);
    expect(sent).toHaveLength(1);
  });

  test("halt stops a descend", () => {
    const { runtime, sent } = flying();
    runtime.descend();
    sent.length = 0;
    runtime.halt();
    const stop = decodeMove(sent[0]);
    expect(stop.opcode).toBe(GameOpcode.MSG_MOVE_STOP_ASCEND);
    expect(stop.flags & MovementFlag.DESCENDING).toBe(0);
  });

  test("halt sends STOP_PITCH for a running pitch", () => {
    const { runtime, sent } = swimming();
    runtime.pitch("up");
    sent.length = 0;
    runtime.halt();
    const stop = decodeMove(sent[0]);
    expect(stop.opcode).toBe(GameOpcode.MSG_MOVE_STOP_PITCH);
    expect(stop.flags & MovementFlag.PITCH_UP).toBe(0);
  });

  test("halt with no active air input sends nothing", () => {
    const { runtime, sent } = flying();
    runtime.halt();
    expect(sent).toHaveLength(0);
  });

  test("halt stops both a pitch and an ascend", () => {
    const { runtime, sent } = flying();
    runtime.pitch("down");
    runtime.ascend("start");
    sent.length = 0;
    runtime.halt();
    expect(sent.map((s) => decodeMove(s).opcode).sort()).toEqual(
      [GameOpcode.MSG_MOVE_STOP_ASCEND, GameOpcode.MSG_MOVE_STOP_PITCH].sort(),
    );
  });

  test("forceRoot clears air inputs before later messages", () => {
    const { runtime, sent } = flying();
    runtime.ascend("start");
    runtime.pitch("up");
    runtime.forceRoot(1);
    runtime.forceUnroot(2);
    sent.length = 0;
    runtime.pitch(0.1);
    const move = decodeMove(must(sent.at(-1)));
    expect(
      move.flags &
        (MovementFlag.ASCENDING |
          MovementFlag.DESCENDING |
          MovementFlag.PITCH_UP |
          MovementFlag.PITCH_DOWN),
    ).toBe(0);
    expect(move.flags & MovementFlag.FLYING).toBe(MovementFlag.FLYING);
  });

  test("losing client control clears air inputs and flying recovers", () => {
    const { runtime, sent } = flying();
    runtime.descend();
    runtime.clientControl({ guid: 0x0764n, allow: false });
    runtime.clientControl({ guid: 0x0764n, allow: true });
    sent.length = 0;
    runtime.pitch(0.1);
    const move = decodeMove(must(sent.at(-1)));
    expect(move.flags & MovementFlag.DESCENDING).toBe(0);
    runtime.ascend("start");
    expect(decodeMove(must(sent.at(-1))).opcode).toBe(
      GameOpcode.MSG_MOVE_START_ASCEND,
    );
  });
});
