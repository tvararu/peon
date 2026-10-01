import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { type Sent, setup } from "#test-support/control-fixtures";
import { must } from "#test-support/must";
import { seatWorldPose } from "#wow/control-ride";
import { parseMovementInfo } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";
import type { SelfEvent } from "#wow/self-store";

const SELF = 0x0764n;
const VEHICLE = 0xf1_30_00_3e_ea_00_0a_bcn;

type Seat = Extract<SelfEvent, { type: "vehicle_seat" }>;

function seat(over: Partial<Seat> = {}): Seat {
  return {
    duration: 1000,
    offset: { x: -1.4, y: 0, z: 0 },
    seat: 0,
    splineId: 77,
    type: "vehicle_seat",
    vehicle: VEHICLE,
    vehiclePose: undefined,
    ...over,
  };
}

function splineDones(sent: Sent[]): Sent[] {
  return sent.filter(
    (packet) => packet.opcode === GameOpcode.CMSG_MOVE_SPLINE_DONE,
  );
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("seat world pose", () => {
  test("the offset turns with the vehicle orientation (VehicleDefines.h:144-153)", () => {
    const pose = seatWorldPose(
      { mapId: 571, orientation: Math.PI / 2, x: 100, y: 200, z: 50 },
      { x: 2, y: 0, z: 1 },
    );
    expect(pose.x).toBeCloseTo(100, 4);
    expect(pose.y).toBeCloseTo(202, 4);
    expect(pose.z).toBeCloseTo(51, 4);
    expect(pose.mapId).toBe(571);
  });
});

describe("passenger seat in control", () => {
  test("boarding refuses free movement as transport and stops a walk", () => {
    const { runtime } = setup();
    runtime.move("forward", 5000);
    expect(runtime.snapshot().moving).toBe(true);
    runtime.vehicleSeat(seat());
    const state = runtime.snapshot();
    expect(state.moving).toBe(false);
    expect(state.movementAllowed).toBe(false);
    expect(state.blockedReason).toBe("transport");
    expect(() => runtime.move("forward", 1000)).toThrow("transport");
  });

  test("the next ack already carries ON_TRANSPORT and the seat block (MovementHandler.cpp:555-559)", () => {
    const { runtime, sent } = setup();
    runtime.vehicleSeat(seat({ seat: 2 }));
    sent.length = 0;
    runtime.forceRoot(5);
    const packet = must(sent.at(-1));
    expect(packet.opcode).toBe(GameOpcode.CMSG_FORCE_MOVE_ROOT_ACK);
    const r = new PacketReader(packet.body);
    expect(r.packedGuidBig()).toBe(SELF);
    expect(r.uint32LE()).toBe(5);
    const block = parseMovementInfo(r).transport;
    expect(block?.guid).toBe(VEHICLE);
    expect(block?.seat).toBe(2);
    expect(block?.x).toBeCloseTo(-1.4, 4);
    expect(block?.y).toBe(0);
    expect(block?.z).toBe(0);
  });

  test("the pose becomes the vehicle position plus the turned offset", () => {
    const { runtime } = setup();
    runtime.vehicleSeat(
      seat({
        offset: { x: 2, y: 0, z: 1 },
        vehiclePose: {
          mapId: 530,
          orientation: Math.PI / 2,
          x: 100,
          y: 200,
          z: 50,
        },
      }),
    );
    const pose = must(runtime.snapshot().pose);
    expect(pose.x).toBeCloseTo(100, 4);
    expect(pose.y).toBeCloseTo(202, 4);
    expect(pose.z).toBeCloseTo(51, 4);
  });

  test("CMSG_MOVE_SPLINE_DONE is sent once after the duration with the spline id (TaxiHandler.cpp:204-214)", () => {
    const { runtime, sent, advance } = setup();
    runtime.vehicleSeat(seat({ duration: 800, splineId: 4242 }));
    advance(799);
    expect(splineDones(sent)).toEqual([]);
    advance(1);
    const done = must(splineDones(sent)[0]);
    const r = new PacketReader(done.body);
    expect(r.packedGuidBig()).toBe(SELF);
    const parsed = parseMovementInfo(r);
    expect(parsed.transport?.guid).toBe(VEHICLE);
    expect(r.uint32LE()).toBe(4242);
    expect(r.remaining).toBe(0);
    advance(10_000);
    expect(splineDones(sent)).toHaveLength(1);
  });

  test("leaving before the spline ends sends nothing and clears the ride", () => {
    const { runtime, sent, advance } = setup();
    runtime.vehicleSeat(seat({ duration: 800 }));
    runtime.vehicleLeft();
    advance(5000);
    expect(splineDones(sent)).toEqual([]);
    sent.length = 0;
    runtime.forceRoot(6);
    const packet = must(sent.at(-1));
    const r = new PacketReader(packet.body);
    r.packedGuidBig();
    r.uint32LE();
    expect(parseMovementInfo(r).transport).toBeUndefined();
  });

  test("a seat change replaces the pending spline done", () => {
    const { runtime, sent, advance } = setup();
    runtime.vehicleSeat(seat({ duration: 800, splineId: 1 }));
    advance(400);
    runtime.vehicleSeat(seat({ duration: 500, seat: 1, splineId: 2 }));
    advance(500);
    const done = splineDones(sent);
    expect(done).toHaveLength(1);
    const r = new PacketReader(must(done[0]).body);
    r.packedGuidBig();
    expect(parseMovementInfo(r).transport?.seat).toBe(1);
    expect(r.uint32LE()).toBe(2);
  });

  test("disposing the control drops a pending spline done", () => {
    const { runtime, sent, advance } = setup();
    runtime.vehicleSeat(seat({ duration: 800 }));
    runtime.dispose();
    advance(5000);
    expect(splineDones(sent)).toEqual([]);
  });

  test("a world change ends the ride", () => {
    const { runtime, sent, advance } = setup();
    runtime.vehicleSeat(seat({ duration: 800 }));
    runtime.newWorld({ mapId: 1, orientation: 0, x: 1, y: 2, z: 3 });
    advance(5000);
    expect(splineDones(sent)).toEqual([]);
  });

  test("boarding and leaving each announce a control change", () => {
    const { runtime, events } = setup();
    events.length = 0;
    runtime.vehicleSeat(seat());
    runtime.vehicleLeft();
    expect(
      events
        .filter((event) => event.type === "control_changed")
        .map((event) => event.reason),
    ).toEqual(["transport", undefined]);
  });
});
