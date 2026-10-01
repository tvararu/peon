import { describe, expect, test } from "bun:test";
import { decodeMove, type Sent, setup } from "#test-support/control-fixtures";
import { must } from "#test-support/must";
import { MovementFlag, UnitFlag } from "#wow/protocol/entity-fields";
import { parseMovementInfo } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

const AIR_INPUTS =
  MovementFlag.PITCH_UP |
  MovementFlag.PITCH_DOWN |
  MovementFlag.ASCENDING |
  MovementFlag.DESCENDING;

function ackFlags(packet: Sent | undefined): number {
  const reader = new PacketReader(must(packet).body);
  reader.packedGuid();
  reader.uint32LE();
  return parseMovementInfo(reader).flags;
}

function observedFlying() {
  const rig = setup();
  rig.runtime.observeSelf({
    movementFlags: MovementFlag.FLYING | MovementFlag.CAN_FLY,
  });
  rig.runtime.setFlying(true);
  rig.sent.length = 0;
  return rig;
}

function flying() {
  const rig = setup();
  rig.runtime.setCanFly(5, true);
  rig.runtime.setFlying(true);
  rig.sent.length = 0;
  return rig;
}

describe("air inputs after server-observed state", () => {
  test("pitch works over observed swimming and carries SWIMMING", () => {
    const { runtime, sent } = setup();
    runtime.observeSelf({ movementFlags: MovementFlag.SWIMMING });
    runtime.setSwimming(true);
    runtime.pitch("up");
    const move = decodeMove(must(sent.at(-1)));
    expect(move.opcode).toBe(GameOpcode.MSG_MOVE_START_PITCH_UP);
    expect(move.flags & MovementFlag.SWIMMING).toBe(MovementFlag.SWIMMING);
    expect(move.flags & MovementFlag.PITCH_UP).toBe(MovementFlag.PITCH_UP);
  });

  test("pitch, ascend and descend keep the observed flight grant", () => {
    const { runtime, sent } = observedFlying();
    const FLY = MovementFlag.FLYING | MovementFlag.CAN_FLY;
    runtime.pitch("down");
    expect(decodeMove(must(sent.at(-1))).flags & FLY).toBe(FLY);
    runtime.ascend("start");
    const up = decodeMove(must(sent.at(-1)));
    expect(up.opcode).toBe(GameOpcode.MSG_MOVE_START_ASCEND);
    expect(up.flags & FLY).toBe(FLY);
    runtime.descend();
    const down = decodeMove(must(sent.at(-1)));
    expect(down.opcode).toBe(GameOpcode.MSG_MOVE_START_DESCEND);
    expect(down.flags & MovementFlag.DESCENDING).toBe(MovementFlag.DESCENDING);
    expect(down.flags & FLY).toBe(FLY);
  });

  test("takeoff on an observed grant carries CAN_FLY", () => {
    const { runtime, sent } = setup();
    runtime.observeSelf({ movementFlags: MovementFlag.CAN_FLY });
    runtime.setFlying(true);
    const takeoff = decodeMove(must(sent.at(-1)));
    expect(takeoff.opcode).toBe(GameOpcode.CMSG_MOVE_SET_FLY);
    expect(takeoff.flags & MovementFlag.CAN_FLY).toBe(MovementFlag.CAN_FLY);
    expect(takeoff.flags & MovementFlag.FLYING).toBe(MovementFlag.FLYING);
  });

  test("a server update that revokes the grant drops CAN_FLY", () => {
    const { runtime, sent } = observedFlying();
    runtime.observeSelf({ movementFlags: MovementFlag.FLYING });
    runtime.pitch("up");
    const move = decodeMove(must(sent.at(-1)));
    expect(move.flags & MovementFlag.CAN_FLY).toBe(0);
  });

  test("observed FLYING alone refuses ground movement", () => {
    const { runtime, sent } = setup();
    runtime.observeSelf({ movementFlags: MovementFlag.FLYING });
    expect(runtime.snapshot().blockedReason).toBe("flying");
    sent.length = 0;
    expect(() => runtime.move("forward", 1000)).toThrow("flying");
    expect(() => runtime.walkToward({ x: 1, y: 2, z: 3 }, 5)).toThrow("flying");
    expect(sent).toEqual([]);
  });

  test("a server update that drops swimming ends the pitch guard", () => {
    const { runtime } = setup();
    runtime.observeSelf({ movementFlags: MovementFlag.SWIMMING });
    runtime.observeSelf({ movementFlags: 0 });
    expect(() => runtime.pitch("up")).toThrow("not_swimming_or_flying");
  });
});

describe("flight permission survives landing", () => {
  test("takeoff, landing and takeoff without a second setCanFly", () => {
    const { runtime, sent } = flying();
    runtime.setFlying(false);
    const land = decodeMove(must(sent.at(-1)));
    expect(land.flags & MovementFlag.FLYING).toBe(0);
    expect(land.flags & MovementFlag.CAN_FLY).toBe(MovementFlag.CAN_FLY);
    runtime.setFlying(true);
    const again = decodeMove(must(sent.at(-1)));
    expect(again.opcode).toBe(GameOpcode.CMSG_MOVE_SET_FLY);
    expect(again.flags & MovementFlag.FLYING).toBe(MovementFlag.FLYING);
  });

  test("revoking the capability still refuses takeoff", () => {
    const { runtime } = flying();
    runtime.setFlying(false);
    runtime.setCanFly(6, false);
    expect(() => runtime.setFlying(true)).toThrow("cannot_fly");
  });

  test("landed with the grant kept stays blocked for ground movement", () => {
    const { runtime } = flying();
    runtime.setFlying(false);
    expect(runtime.snapshot().blockedReason).toBe("flying");
  });
});

describe("forced interruptions cancel air inputs", () => {
  test("revoking flight drops PITCH_UP from the acknowledgement", () => {
    const { runtime, sent } = flying();
    runtime.pitch("up");
    sent.length = 0;
    runtime.setCanFly(6, false);
    const ack = sent.find(
      (s) => s.opcode === GameOpcode.CMSG_MOVE_SET_CAN_FLY_ACK,
    );
    expect(ackFlags(ack) & AIR_INPUTS).toBe(0);
  });

  test("DISABLE_MOVE drops an active ascend for later packets", () => {
    const { runtime, sent } = flying();
    runtime.ascend("start");
    runtime.observeSelf({ unitFlags: UnitFlag.DISABLE_MOVE });
    runtime.observeSelf({ unitFlags: 0 });
    sent.length = 0;
    runtime.pitch(0.1);
    const move = decodeMove(must(sent.at(-1)));
    expect(move.flags & AIR_INPUTS).toBe(0);
    expect(move.flags & MovementFlag.FLYING).toBe(MovementFlag.FLYING);
  });

  test("a stunned descend is gone after the blocker lifts", () => {
    const { runtime, sent } = flying();
    runtime.descend();
    runtime.observeSelf({ unitFlags: UnitFlag.STUNNED });
    runtime.observeSelf({ unitFlags: 0 });
    sent.length = 0;
    runtime.ascend("stop");
    expect(decodeMove(must(sent.at(-1))).flags & AIR_INPUTS).toBe(0);
  });

  test("a server position correction drops a running pitch", () => {
    const { runtime, sent } = flying();
    runtime.pitch("down");
    runtime.observeSelf({
      position: { mapId: 0, x: 1, y: 2, z: 3, orientation: 0 },
    });
    sent.length = 0;
    runtime.pitch(0.1);
    expect(decodeMove(must(sent.at(-1))).flags & AIR_INPUTS).toBe(0);
  });
});
