import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { type Sent, setup } from "#test-support/control-fixtures";
import { must } from "#test-support/must";
import { MovementFlag } from "#wow/protocol/entity-fields";
import { parseMovementInfo } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";
import type { MoveFlag, SelfEvent } from "#wow/self-store";

const VEHICLE = 0xf1_30_00_3e_ea_00_0a_bcn;
const OTHER = 0xf1_30_00_3e_ea_00_0b_bcn;
const POSE = { mapId: 530, orientation: 1, x: 100, y: 200, z: 50 };

type Seat = Extract<SelfEvent, { type: "vehicle_seat" }>;

function seat(): Seat {
  return {
    duration: 0,
    facing: 0,
    offset: { x: 0, y: 0, z: 1 },
    seat: 0,
    splineId: undefined,
    type: "vehicle_seat",
    vehicle: VEHICLE,
    vehiclePose: POSE,
  };
}

function adopt() {
  const harness = setup();
  harness.runtime.vehicleSeat(seat());
  harness.runtime.clientControl({ allow: true, guid: VEHICLE });
  harness.sent.length = 0;
  return harness;
}

function decodeAck(packet: Sent | undefined) {
  const { opcode, body } = must(packet);
  const r = new PacketReader(body);
  const guid = r.packedGuidBig();
  const counter = r.uint32LE();
  const info = parseMovementInfo(r);
  if (r.remaining >= 4) r.uint32LE();
  return { counter, flags: info.flags, guid, opcode };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

const FLAGS: readonly {
  flag: MoveFlag;
  bit: number;
  set: number;
  clear: number;
}[] = [
  {
    bit: MovementFlag.DISABLE_GRAVITY,
    clear: GameOpcode.CMSG_MOVE_GRAVITY_ENABLE_ACK,
    flag: "gravity_off",
    set: GameOpcode.CMSG_MOVE_GRAVITY_DISABLE_ACK,
  },
  {
    bit: MovementFlag.HOVER,
    clear: GameOpcode.CMSG_MOVE_HOVER_ACK,
    flag: "hover",
    set: GameOpcode.CMSG_MOVE_HOVER_ACK,
  },
  {
    bit: MovementFlag.WATERWALKING,
    clear: GameOpcode.CMSG_MOVE_WATER_WALK_ACK,
    flag: "water_walk",
    set: GameOpcode.CMSG_MOVE_WATER_WALK_ACK,
  },
  {
    bit: MovementFlag.FALLING_SLOW,
    clear: GameOpcode.CMSG_MOVE_FEATHER_FALL_ACK,
    flag: "feather_fall",
    set: GameOpcode.CMSG_MOVE_FEATHER_FALL_ACK,
  },
];

describe("forced movement flags naming the driven vehicle (Unit.cpp:16105-16114)", () => {
  for (const { flag, bit, set, clear } of FLAGS) {
    test(`${flag} is acknowledged under the vehicle guid and adopted, then cleared`, () => {
      const { runtime, sent } = adopt();
      runtime.moveFlag(flag, true, 5, VEHICLE);
      const on = decodeAck(sent[0]);
      expect(on.opcode).toBe(set);
      expect(on.guid).toBe(VEHICLE);
      expect(on.counter).toBe(5);
      expect(on.flags & bit).toBe(bit);
      runtime.moveFlag(flag, false, 6, VEHICLE);
      const off = decodeAck(sent[1]);
      expect(off.opcode).toBe(clear);
      expect(off.guid).toBe(VEHICLE);
      expect(off.flags & bit).toBe(0);
    });
  }

  test("gravity disabled on the vehicle refuses ground movement until it returns", () => {
    const { runtime } = adopt();
    runtime.moveFlag("gravity_off", true, 5, VEHICLE);
    expect(() => runtime.move("forward", 500)).toThrow("disable_gravity");
    runtime.moveFlag("gravity_off", false, 6, VEHICLE);
    runtime.move("forward", 500);
    expect(runtime.snapshot().moving).toBe(true);
    runtime.halt();
  });

  test("a flag for an unrelated guid sends nothing and changes nothing", () => {
    const { runtime, sent } = adopt();
    runtime.moveFlag("gravity_off", true, 5, OTHER);
    expect(sent).toHaveLength(0);
    expect(() => runtime.move("forward", 500)).not.toThrow();
    runtime.halt();
  });
  test("a flag for the vehicle is ignored while it is not the mover", () => {
    const harness = adopt();
    harness.runtime.clientControl({ allow: false, guid: VEHICLE });
    harness.sent.length = 0;
    const { runtime, sent } = harness;
    runtime.moveFlag("gravity_off", true, 5, VEHICLE);
    expect(sent).toHaveLength(0);
  });

  test("the vehicle's flag does not stay on the character after the vehicle is dropped", () => {
    const { runtime, sent } = adopt();
    runtime.moveFlag("gravity_off", true, 5, VEHICLE);
    runtime.clientControl({ allow: false, guid: VEHICLE });
    runtime.vehicleLeft();
    sent.length = 0;
    runtime.moveFlag("hover", true, 7);
    expect(decodeAck(sent[0]).flags & MovementFlag.DISABLE_GRAVITY).toBe(0);
    runtime.move("forward", 500);
    expect(runtime.snapshot().moving).toBe(true);
    runtime.halt();
  });
});
