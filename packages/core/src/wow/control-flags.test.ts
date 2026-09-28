import { describe, expect, jest, test } from "bun:test";
import { decodeMove, type Sent, setup } from "#test-support/control-fixtures";
import { must } from "#test-support/must";
import { MovementFlag } from "#wow/protocol/entity-fields";
import { parseMovementInfo } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

function decodeAck(packet: Sent | undefined) {
  const { opcode, body } = must(packet);
  const r = new PacketReader(body);
  const guid = r.packedGuidBig();
  const counter = r.uint32LE();
  const info = parseMovementInfo(r);
  const applied = r.uint32LE();
  return {
    applied,
    counter,
    flags: info.flags,
    guid,
    left: r.remaining,
    opcode,
  };
}

function decodeGravityAck(packet: Sent | undefined) {
  const { opcode, body } = must(packet);
  const r = new PacketReader(body);
  const guid = r.packedGuidBig();
  const counter = r.uint32LE();
  const info = parseMovementInfo(r);
  return { counter, flags: info.flags, guid, left: r.remaining, opcode };
}

describe("ControlRuntime.moveFlag (AC Handlers/MiscHandler.cpp:1505-1520)", () => {
  test("water walk ack carries the packed guid, the counter, WATERWALKING and isApplied 1", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    runtime.moveFlag("water_walk", true, 7);
    expect(sent).toHaveLength(1);
    const ack = decodeAck(sent[0]);
    expect(ack.opcode).toBe(GameOpcode.CMSG_MOVE_WATER_WALK_ACK);
    expect(ack.guid).toBe(0x0764n);
    expect(ack.counter).toBe(7);
    expect(ack.flags & MovementFlag.WATERWALKING).toBe(
      MovementFlag.WATERWALKING,
    );
    expect(ack.applied).toBe(1);
    expect(ack.left).toBe(0);
  });

  test("an acked flag stays in every later move (AC Handlers/MovementHandler.cpp:435)", () => {
    jest.useFakeTimers();
    try {
      const { runtime, sent, advance } = setup();
      runtime.moveFlag("water_walk", true, 7);
      runtime.moveFlag("hover", true, 8);
      sent.length = 0;
      runtime.move("forward", 2000);
      advance(600);
      const heartbeat = decodeMove(
        sent.find((p) => p.opcode === GameOpcode.MSG_MOVE_HEARTBEAT),
      );
      expect(heartbeat.flags & MovementFlag.WATERWALKING).toBe(
        MovementFlag.WATERWALKING,
      );
      expect(heartbeat.flags & MovementFlag.HOVER).toBe(MovementFlag.HOVER);
      runtime.halt();
    } finally {
      jest.useRealTimers();
    }
  });

  test("land walk clears WATERWALKING and writes isApplied 0", () => {
    jest.useFakeTimers();
    try {
      const { runtime, sent, advance } = setup();
      runtime.moveFlag("water_walk", true, 7);
      sent.length = 0;
      runtime.moveFlag("water_walk", false, 9);
      const ack = decodeAck(sent[0]);
      expect(ack.opcode).toBe(GameOpcode.CMSG_MOVE_WATER_WALK_ACK);
      expect(ack.counter).toBe(9);
      expect(ack.flags & MovementFlag.WATERWALKING).toBe(0);
      expect(ack.applied).toBe(0);
      sent.length = 0;
      runtime.move("forward", 2000);
      advance(600);
      const heartbeat = decodeMove(
        sent.find((p) => p.opcode === GameOpcode.MSG_MOVE_HEARTBEAT),
      );
      expect(heartbeat.flags & MovementFlag.WATERWALKING).toBe(0);
      runtime.halt();
    } finally {
      jest.useRealTimers();
    }
  });

  test("hover acks with CMSG_MOVE_HOVER_ACK and the HOVER bit, set and unset", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    runtime.moveFlag("hover", true, 3);
    runtime.moveFlag("hover", false, 4);
    const [set, unset] = sent.map(decodeAck);
    expect(must(set).opcode).toBe(GameOpcode.CMSG_MOVE_HOVER_ACK);
    expect(must(set).flags & MovementFlag.HOVER).toBe(MovementFlag.HOVER);
    expect(must(set).applied).toBe(1);
    expect(must(set).counter).toBe(3);
    expect(must(unset).opcode).toBe(GameOpcode.CMSG_MOVE_HOVER_ACK);
    expect(must(unset).flags & MovementFlag.HOVER).toBe(0);
    expect(must(unset).applied).toBe(0);
    expect(must(unset).counter).toBe(4);
  });

  test("flag acks do not stop a running move", () => {
    jest.useFakeTimers();
    try {
      const { runtime } = setup();
      runtime.move("forward", 2000);
      runtime.moveFlag("water_walk", true, 7);
      runtime.moveFlag("hover", false, 8);
      expect(runtime.snapshot().moving).toBe(true);
      expect(runtime.snapshot().movementAllowed).toBe(true);
      runtime.halt();
    } finally {
      jest.useRealTimers();
    }
  });

  test("death order: acks after a root carry ROOT and echo their own counters (AC Entities/Player/Player.cpp:4643, Entities/Unit/Unit.cpp:11113, Entities/Player/Player.cpp:4539, Handlers/MovementHandler.cpp:606-609)", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    runtime.forceRoot(3);
    runtime.moveFlag("hover", false, 4);
    runtime.moveFlag("water_walk", true, 5);
    const [root, hover, water] = sent;
    expect(must(root).opcode).toBe(GameOpcode.CMSG_FORCE_MOVE_ROOT_ACK);
    const hoverAck = decodeAck(hover);
    const waterAck = decodeAck(water);
    expect(hoverAck.opcode).toBe(GameOpcode.CMSG_MOVE_HOVER_ACK);
    expect(hoverAck.counter).toBe(4);
    expect(hoverAck.flags & MovementFlag.ROOT).toBe(MovementFlag.ROOT);
    expect(waterAck.opcode).toBe(GameOpcode.CMSG_MOVE_WATER_WALK_ACK);
    expect(waterAck.counter).toBe(5);
    expect(waterAck.flags & MovementFlag.ROOT).toBe(MovementFlag.ROOT);
    expect(waterAck.flags & MovementFlag.WATERWALKING).toBe(
      MovementFlag.WATERWALKING,
    );
  });

  test("a new world clears the acked flag bits", () => {
    jest.useFakeTimers();
    try {
      const { runtime, sent, advance } = setup();
      runtime.moveFlag("water_walk", true, 7);
      runtime.moveFlag("hover", true, 8);
      runtime.newWorld({ mapId: 0, orientation: 0, x: 1, y: 2, z: 3 });
      sent.length = 0;
      runtime.move("forward", 2000);
      advance(600);
      const heartbeat = decodeMove(
        sent.find((p) => p.opcode === GameOpcode.MSG_MOVE_HEARTBEAT),
      );
      expect(
        heartbeat.flags & (MovementFlag.WATERWALKING | MovementFlag.HOVER),
      ).toBe(0);
      runtime.halt();
    } finally {
      jest.useRealTimers();
    }
  });

  test("feather fall acks with CMSG_MOVE_FEATHER_FALL_ACK, FALLING_SLOW and isApplied, set and unset", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    runtime.moveFlag("feather_fall", true, 13);
    runtime.moveFlag("feather_fall", false, 14);
    const [set, unset] = sent.map(decodeAck);
    expect(must(set).opcode).toBe(GameOpcode.CMSG_MOVE_FEATHER_FALL_ACK);
    expect(must(set).guid).toBe(0x0764n);
    expect(must(set).counter).toBe(13);
    expect(must(set).flags & MovementFlag.FALLING_SLOW).toBe(
      MovementFlag.FALLING_SLOW,
    );
    expect(must(set).applied).toBe(1);
    expect(must(set).left).toBe(0);
    expect(must(unset).opcode).toBe(GameOpcode.CMSG_MOVE_FEATHER_FALL_ACK);
    expect(must(unset).counter).toBe(14);
    expect(must(unset).flags & MovementFlag.FALLING_SLOW).toBe(0);
    expect(must(unset).applied).toBe(0);
  });

  test("gravity acks carry no isApplied and pick the opcode by direction (AC Handlers/MiscHandler.cpp:1518-1519)", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    runtime.moveFlag("gravity_off", true, 21);
    runtime.moveFlag("gravity_off", false, 22);
    const [off, on] = sent.map(decodeGravityAck);
    expect(must(off).opcode).toBe(GameOpcode.CMSG_MOVE_GRAVITY_DISABLE_ACK);
    expect(must(off).guid).toBe(0x0764n);
    expect(must(off).counter).toBe(21);
    expect(must(off).flags & MovementFlag.DISABLE_GRAVITY).toBe(
      MovementFlag.DISABLE_GRAVITY,
    );
    expect(must(off).left).toBe(0);
    expect(must(on).opcode).toBe(GameOpcode.CMSG_MOVE_GRAVITY_ENABLE_ACK);
    expect(must(on).counter).toBe(22);
    expect(must(on).flags & MovementFlag.DISABLE_GRAVITY).toBe(0);
    expect(must(on).left).toBe(0);
  });

  test("a gravity-off character refuses a move with disable_gravity until gravity returns", () => {
    jest.useFakeTimers();
    try {
      const { runtime } = setup();
      runtime.moveFlag("gravity_off", true, 21);
      expect(runtime.snapshot().blockedReason).toBe("disable_gravity");
      expect(() => runtime.move("forward", 500)).toThrow("disable_gravity");
      runtime.moveFlag("gravity_off", false, 22);
      expect(runtime.snapshot().blockedReason).toBeUndefined();
      runtime.move("forward", 500);
      expect(runtime.snapshot().moving).toBe(true);
      runtime.halt();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("ControlRuntime.transferAborted (AC Handlers/MovementHandler.cpp:91-97)", () => {
  test("after handleTransferPending, a transfer abort arms a watchdog that clears teleporting", () => {
    jest.useFakeTimers();
    try {
      const { runtime, advance } = setup();
      runtime.handleTransferPending();
      expect(runtime.snapshot().blockedReason).toBe("teleporting");
      runtime.transferAborted({ arg: undefined, mapId: 36, reason: 4 });
      expect(runtime.snapshot().blockedReason).toBe("teleporting");
      advance(10_000);
      expect(runtime.snapshot().blockedReason).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  test("a new_world first cancels the abort watchdog", () => {
    jest.useFakeTimers();
    try {
      const { runtime, sent, advance } = setup();
      runtime.handleTransferPending();
      runtime.transferAborted({ arg: undefined, mapId: 36, reason: 4 });
      runtime.newWorld({
        mapId: 36,
        orientation: 0,
        x: 0,
        y: 0,
        z: 0,
      });
      advance(10_000);
      expect(
        sent.some((p) => p.opcode === GameOpcode.MSG_MOVE_WORLDPORT_ACK),
      ).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test("an abort with no pending transfer arms nothing", () => {
    jest.useFakeTimers();
    try {
      const { runtime, advance } = setup();
      runtime.transferAborted({ arg: undefined, mapId: 36, reason: 4 });
      advance(10_000);
      expect(runtime.snapshot().blockedReason).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });
});
