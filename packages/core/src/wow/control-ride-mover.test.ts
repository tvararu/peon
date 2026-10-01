import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { decodeMove, type Sent, setup } from "#test-support/control-fixtures";
import { must } from "#test-support/must";
import { MovementFlag } from "#wow/protocol/entity-fields";
import {
  buildMoveMessage,
  type MovementInfo,
  parseMovementInfo,
} from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";
import type { SelfEvent } from "#wow/self-store";

const SELF = 0x0764n;
const VEHICLE = 0xf1_30_00_3e_ea_00_0a_bcn;
const OTHER = 0xf1_30_00_3e_ea_00_0b_bcn;
const POSE = { mapId: 530, orientation: 1, x: 100, y: 200, z: 50 };

type Seat = Extract<SelfEvent, { type: "vehicle_seat" }>;

function seat(over: Partial<Seat> = {}): Seat {
  return {
    duration: 0,
    facing: 0,
    offset: { x: 0, y: 0, z: 1 },
    seat: 0,
    splineId: undefined,
    type: "vehicle_seat",
    vehicle: VEHICLE,
    vehiclePose: POSE,
    ...over,
  };
}

function opcodes(sent: Sent[]): number[] {
  return sent.map((packet) => packet.opcode);
}

function drive() {
  const harness = setup();
  harness.runtime.vehicleSeat(seat());
  harness.runtime.clientControl({ allow: true, guid: VEHICLE });
  harness.runtime.moverState({
    guid: VEHICLE,
    pose: POSE,
    run: 12,
    runBack: 6,
    turn: 2,
  });
  harness.sent.length = 0;
  return harness;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("taking the vehicle as mover", () => {
  test("a control update for the seat vehicle replaces the refusal and announces the mover (MovementHandler.cpp:779-814)", () => {
    const { runtime, sent, events } = setup();
    runtime.vehicleSeat(seat());
    sent.length = 0;
    runtime.clientControl({ allow: true, guid: VEHICLE });
    const state = runtime.snapshot();
    expect(state.mover).toBe(VEHICLE);
    expect(state.movementAllowed).toBe(true);
    expect(events.at(-1)?.type).toBe("control_changed");
    expect(events.at(-1)?.reason).toBe("vehicle");
    expect(opcodes(sent)).toEqual([
      GameOpcode.CMSG_MOVE_NOT_ACTIVE_MOVER,
      GameOpcode.CMSG_SET_ACTIVE_MOVER,
    ]);
    const first = new PacketReader(must(sent[0]).body);
    expect(first.packedGuidBig()).toBe(SELF);
    expect(new PacketReader(must(sent[1]).body).uint64LE()).toBe(VEHICLE);
  });

  test("a control update for a unit that is not the seat vehicle stays refused", () => {
    const { runtime, sent } = setup();
    runtime.vehicleSeat(seat());
    sent.length = 0;
    runtime.clientControl({ allow: true, guid: OTHER });
    const state = runtime.snapshot();
    expect(state.mover).toBeUndefined();
    expect(state.blockedReason).toBe("no_control");
    expect(sent).toEqual([]);
  });

  test("a control update that arrives before the seat is adopted when the seat lands", () => {
    const { runtime, sent } = setup();
    runtime.clientControl({ allow: true, guid: VEHICLE });
    expect(runtime.snapshot().mover).toBeUndefined();
    expect(runtime.snapshot().blockedReason).toBe("no_control");
    sent.length = 0;
    runtime.vehicleSeat(seat());
    expect(runtime.snapshot().mover).toBe(VEHICLE);
    expect(runtime.snapshot().movementAllowed).toBe(true);
    expect(opcodes(sent)).toContain(GameOpcode.CMSG_SET_ACTIVE_MOVER);
  });

  test("a pending mover for another vehicle is not adopted by a later seat", () => {
    const { runtime } = setup();
    runtime.clientControl({ allow: true, guid: OTHER });
    runtime.vehicleSeat(seat());
    expect(runtime.snapshot().mover).toBeUndefined();
  });
});

describe("driving the vehicle", () => {
  test("moves carry the vehicle guid, pose and run speed, with no transport block", () => {
    const { runtime, sent, advance } = drive();
    runtime.move("forward", 1000);
    advance(600);
    const packet = decodeMove(sent[0]);
    expect(packet.guid).toBe(VEHICLE);
    expect(packet.opcode).toBe(GameOpcode.MSG_MOVE_START_FORWARD);
    expect(packet.transport).toBeUndefined();
    expect(packet.flags & MovementFlag.ON_TRANSPORT).toBe(0);
    expect(packet.x).toBeCloseTo(100, 0);
    expect(packet.y).toBeCloseTo(200, 0);
    const last = decodeMove(sent.at(-1));
    const traveled = Math.hypot(last.x - 100, last.y - 200);
    expect(traveled).toBeGreaterThan(3);
    expect(traveled).toBeLessThan(7.2 + 0.6);
  });

  test("a driven vehicle with flight flags refuses ground movement even when the passenger has no flying flag", () => {
    const { runtime } = setup();
    runtime.vehicleSeat(seat());
    runtime.observeSelf({ movementFlags: 0 });
    runtime.clientControl({ allow: true, guid: VEHICLE });
    runtime.moverState({
      flags: MovementFlag.CAN_FLY | MovementFlag.FLYING,
      guid: VEHICLE,
      pose: POSE,
      run: 12,
      runBack: 6,
      turn: 2,
    });
    expect(runtime.snapshot().blockedReason).toBe("flying");
    expect(() => runtime.move("forward", 1000)).toThrow("flying");
  });

  test("a driven ground vehicle permits ground movement", () => {
    const { runtime } = setup();
    runtime.vehicleSeat(seat());
    runtime.clientControl({ allow: true, guid: VEHICLE });
    runtime.moverState({
      flags: 0,
      guid: VEHICLE,
      pose: POSE,
      run: 12,
      runBack: 6,
      turn: 2,
    });
    expect(runtime.snapshot().movementAllowed).toBe(true);
  });

  test("the character's own root does not block the vehicle or reach its movement info (live: SMSG_FORCE_MOVE_ROOT follows the control update)", () => {
    const { runtime, sent } = setup();
    runtime.vehicleSeat(seat());
    runtime.clientControl({ allow: true, guid: VEHICLE });
    runtime.forceRoot(3);
    runtime.moverState({
      guid: VEHICLE,
      pose: POSE,
      run: 12,
      runBack: 6,
      turn: 2,
    });
    expect(runtime.snapshot().movementAllowed).toBe(true);
    sent.length = 0;
    runtime.move("forward", 1000);
    const packet = decodeMove(sent[0]);
    expect(packet.flags & MovementFlag.ROOT).toBe(0);
    expect(packet.guid).toBe(VEHICLE);
  });

  test("a root for the driven vehicle refuses its movement and keeps the flag in its packet", () => {
    const { runtime, sent } = setup();
    runtime.vehicleSeat(seat());
    runtime.clientControl({ allow: true, guid: VEHICLE });
    runtime.moverState({
      flags: 0,
      guid: VEHICLE,
      pose: POSE,
      run: 12,
      runBack: 6,
      turn: 2,
    });
    runtime.forceRoot(3, VEHICLE);
    expect(runtime.snapshot().movementAllowed).toBe(false);
    expect(() => runtime.move("forward", 1000)).toThrow("rooted");
    expect(sent).toHaveLength(4);
    runtime.forceUnroot(4, VEHICLE);
    expect(runtime.snapshot().movementAllowed).toBe(true);
    const ack = decodeMove(sent.at(-2));
    expect(ack.guid).toBe(VEHICLE);
  });

  test("the character stays rooted after the vehicle is lost until the unroot arrives", () => {
    const { runtime } = setup();
    runtime.vehicleSeat(seat());
    runtime.clientControl({ allow: true, guid: VEHICLE });
    runtime.forceRoot(3);
    runtime.clientControl({ allow: false, guid: VEHICLE });
    expect(runtime.snapshot().blockedReason).toBe("rooted");
    runtime.forceUnroot(4);
    runtime.vehicleLeft();
    expect(runtime.snapshot().movementAllowed).toBe(true);
  });

  test("self observations do not move the driven pose", () => {
    const { runtime } = drive();
    runtime.observeSelf({
      position: { mapId: 530, orientation: 0, x: 1, y: 2, z: 3 },
      runSpeed: 7,
    });
    const pose = must(runtime.snapshot().pose);
    expect(pose.x).toBe(100);
    expect(pose.y).toBe(200);
  });

  test("a mover state for another guid is ignored", () => {
    const { runtime } = drive();
    runtime.moverState({
      guid: OTHER,
      pose: undefined,
      run: 99,
      runBack: 1,
      turn: 1,
    });
    runtime.move("forward", 1000);
    expect(runtime.snapshot().speed).toBe(12);
  });

  test("speed acks for the vehicle use the vehicle guid", () => {
    const { runtime, sent } = drive();
    runtime.forceRoot(9);
    expect(decodeMove(sent.at(-1)).guid).toBe(VEHICLE);
  });
});

describe("boarding spline done while driving", () => {
  test("the passenger's spline-done keeps its own guid and the seat block (TaxiHandler.cpp:204-214)", () => {
    const { runtime, sent, advance } = setup();
    runtime.vehicleSeat(seat({ duration: 800, seat: 1, splineId: 77 }));
    runtime.clientControl({ allow: true, guid: VEHICLE });
    sent.length = 0;
    advance(800);
    const done = sent.find(
      (packet) => packet.opcode === GameOpcode.CMSG_MOVE_SPLINE_DONE,
    );
    const read = new PacketReader(must(done).body);
    expect(read.packedGuidBig()).toBe(SELF);
    const parsed = parseMovementInfo(read);
    expect(parsed.transport?.guid).toBe(VEHICLE);
    expect(parsed.transport?.seat).toBe(1);
    expect(read.uint32LE()).toBe(77);
  });
});

describe("mover_packet", () => {
  test("builds the packet from the mover guid and the current movement info", () => {
    const { runtime, sent } = drive();
    const seen: { guid: bigint; info: MovementInfo }[] = [];
    runtime.moverPacket(
      GameOpcode.CMSG_DISMISS_CONTROLLED_VEHICLE,
      (guid, current) => {
        seen.push({ guid, info: current });
        return buildMoveMessage(guid, current);
      },
    );
    const packet = must(sent.at(-1));
    expect(packet.opcode).toBe(GameOpcode.CMSG_DISMISS_CONTROLLED_VEHICLE);
    expect(must(seen[0]).guid).toBe(VEHICLE);
    expect(decodeMove(packet).x).toBeCloseTo(100, 4);
    expect(must(seen[0]).info.transport).toBeUndefined();
  });
});

describe("losing the vehicle", () => {
  test("allow 0 sends the old mover then the character and restores self control", () => {
    const { runtime, sent, events } = drive();
    runtime.clientControl({ allow: false, guid: VEHICLE });
    expect(opcodes(sent)).toEqual([
      GameOpcode.CMSG_MOVE_NOT_ACTIVE_MOVER,
      GameOpcode.CMSG_SET_ACTIVE_MOVER,
    ]);
    expect(new PacketReader(must(sent[0]).body).packedGuidBig()).toBe(VEHICLE);
    expect(new PacketReader(must(sent[1]).body).uint64LE()).toBe(SELF);
    const state = runtime.snapshot();
    expect(state.mover).toBeUndefined();
    expect(state.blockedReason).toBe("transport");
    expect(events.at(-1)?.reason).toBe("vehicle");
    expect(events.at(-1)?.state.mover).toBeUndefined();
  });

  test("the character's own speed returns after the vehicle is lost", () => {
    const { runtime } = drive();
    runtime.clientControl({ allow: false, guid: VEHICLE });
    runtime.vehicleLeft();
    runtime.move("forward", 1000);
    expect(runtime.snapshot().speed).toBe(7);
  });

  test("leaving the seat while driving drops the mover", () => {
    const { runtime, sent } = drive();
    runtime.vehicleLeft();
    expect(runtime.snapshot().mover).toBeUndefined();
    expect(opcodes(sent)).toContain(GameOpcode.CMSG_SET_ACTIVE_MOVER);
    expect(runtime.snapshot().movementAllowed).toBe(true);
  });

  test("a driven walk stops when the vehicle is lost", () => {
    const { runtime } = drive();
    runtime.move("forward", 5000);
    expect(runtime.snapshot().moving).toBe(true);
    runtime.clientControl({ allow: false, guid: VEHICLE });
    expect(runtime.snapshot().moving).toBe(false);
  });
});
