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
});
