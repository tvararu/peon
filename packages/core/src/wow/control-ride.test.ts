import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { info, type Sent, setup } from "#test-support/control-fixtures";
import { must } from "#test-support/must";
import { seatWorldPose } from "#wow/control-ride";
import { MovementFlag } from "#wow/protocol/entity-fields";
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
    facing: 0,
    offset: { x: -1.4, y: 0, z: 0 },
    seat: 0,
    splineId: 77,
    type: "vehicle_seat",
    vehicle: VEHICLE,
    vehiclePose: undefined,
    ...over,
  };
}

const TRANSPORT = 0xf1_20_00_3e_ad_de_00_01n;

type Board = Extract<SelfEvent, { type: "transport_board" }>;

function board(over: Partial<Board> = {}): Board {
  const pose = {
    mapId: 530,
    moving: false,
    orientation: 0,
    x: 8709.46,
    y: -6671.76,
    z: 70.34,
  };
  return {
    guid: TRANSPORT,
    poseAt: () => ({ ...pose }),
    type: "transport_board",
    ...over,
  };
}

function transportOf(body: Uint8Array) {
  const r = new PacketReader(body);
  r.packedGuidBig();
  return parseMovementInfo(r);
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

describe("passenger seat facing", () => {
  test("a nonzero seat facing reaches the ack transport orientation (Vehicle.cpp:414,454-466; Unit.cpp:734-750)", () => {
    const { runtime, sent } = setup();
    runtime.vehicleSeat(seat({ facing: 1.5, seat: 2 }));
    sent.length = 0;
    runtime.forceRoot(5);
    const r = new PacketReader(must(sent.at(-1)).body);
    r.packedGuidBig();
    r.uint32LE();
    const parsed = parseMovementInfo(r);
    expect(parsed.transport?.seat).toBe(2);
    expect(parsed.transport?.orientation).toBeCloseTo(1.5, 5);
  });

  test("a nonzero seat facing adds to the vehicle orientation in the adopted pose", () => {
    const { runtime } = setup();
    runtime.vehicleSeat(
      seat({
        facing: 0.5,
        vehiclePose: { mapId: 571, orientation: 1, x: 100, y: 200, z: 50 },
      }),
    );
    expect(runtime.snapshot().pose?.orientation).toBeCloseTo(1.5, 5);
  });
});

describe("passenger seat in control", () => {
  test("a forced teleport ends the boarding timer and the ride", () => {
    const { runtime, sent, advance } = setup();
    runtime.vehicleSeat(seat({ duration: 800 }));
    runtime.teleportAck({ counter: 2, guid: SELF, info: info({}) });
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

  test("a seat without a boarding spline sends no spline done but still carries the transport block", () => {
    const { runtime, sent, advance } = setup();
    runtime.vehicleSeat(seat({ duration: 0, splineId: undefined }));
    advance(10_000);
    expect(splineDones(sent)).toEqual([]);
    sent.length = 0;
    runtime.forceRoot(6);
    const packet = must(sent.at(-1));
    const r = new PacketReader(packet.body);
    r.packedGuidBig();
    r.uint32LE();
    expect(parseMovementInfo(r).transport?.guid).toBe(VEHICLE);
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
    sent.length = 0;
    runtime.forceRoot(6);
    const r = new PacketReader(must(sent.at(-1)).body);
    r.packedGuidBig();
    r.uint32LE();
    expect(parseMovementInfo(r).transport).toBeUndefined();
  });

  test("a transport teleport survives a world change only until the worldport", () => {
    const { runtime, sent } = setup();
    runtime.teleportAck({
      guid: SELF,
      counter: 2,
      info: info({
        flags: MovementFlag.ON_TRANSPORT,
        transport: {
          guid: VEHICLE,
          orientation: 0.25,
          seat: 1,
          time: 44,
          x: 1,
          y: 2,
          z: 3,
        },
      }),
    });
    runtime.newWorld({ mapId: 1, orientation: 0, x: 1, y: 2, z: 3 });
    sent.length = 0;
    runtime.forceRoot(6);
    const r = new PacketReader(must(sent.at(-1)).body);
    r.packedGuidBig();
    r.uint32LE();
    expect(parseMovementInfo(r).transport).toBeUndefined();
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

  test("boarding after a walk or a face adopts the seat pose, not the prediction", () => {
    const { runtime, sent, advance } = setup();
    runtime.face(2);
    runtime.move("forward", 5000);
    advance(500);
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
    sent.length = 0;
    advance(1000);
    const done = new PacketReader(must(splineDones(sent)[0]).body);
    done.packedGuidBig();
    const parsed = parseMovementInfo(done);
    expect(parsed.x).toBeCloseTo(100, 4);
    expect(parsed.y).toBeCloseTo(202, 4);
  });

  test("the vehicle-left notification already allows movement", () => {
    const { runtime, events } = setup();
    runtime.vehicleSeat(seat());
    events.length = 0;
    let during: { allowed: boolean; reason: string | undefined } | undefined;
    runtime.onEvent((event) => {
      if (event.type === "control_changed" && event.reason === undefined) {
        during = {
          allowed: event.state.movementAllowed,
          reason: event.state.blockedReason,
        };
        runtime.move("forward", 100);
      }
    });
    runtime.vehicleLeft();
    expect(during).toEqual({ allowed: true, reason: undefined });
    expect(runtime.snapshot().moving).toBe(true);
  });
});

describe("transport ride in control", () => {
  test("boarding sends one CMSG_MOVE_CHNG_TRANSPORT with ON_TRANSPORT (MovementHandler.cpp:362-408)", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    runtime.transportBoard(board());
    expect(sent).toHaveLength(1);
    expect(must(sent[0]).opcode).toBe(GameOpcode.CMSG_MOVE_CHNG_TRANSPORT);
    const parsed = transportOf(must(sent[0]).body);
    expect(parsed.flags & MovementFlag.ON_TRANSPORT).toBe(
      MovementFlag.ON_TRANSPORT,
    );
    expect(parsed.transport?.guid).toBe(TRANSPORT);
    expect(parsed.transport?.x).toBeCloseTo(0, 4);
    expect(parsed.transport?.seat).toBe(0);
    expect(parsed.x).toBeCloseTo(8709.46, 2);
    expect(parsed.y).toBeCloseTo(-6671.76, 2);
  });

  test("the world position without ON_TRANSPORT stays on the ground after the ride", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    runtime.transportBoard(board());
    runtime.transportLeave();
    expect(sent).toHaveLength(2);
    const parsed = transportOf(must(sent[1]).body);
    expect(parsed.flags & MovementFlag.ON_TRANSPORT).toBe(0);
    expect(parsed.transport).toBeUndefined();
    expect(parsed.x).toBeCloseTo(8709.46, 2);
    expect(parsed.y).toBeCloseTo(-6671.76, 2);
  });

  test("boarding at the current place keeps the rotated offset (SR3-vehicles-46)", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    runtime.transportBoard(
      board({
        poseAt: () => ({
          mapId: 530,
          moving: false,
          orientation: Math.PI / 2,
          x: 8709.46 + 10,
          y: -6671.76,
          z: 70.34,
        }),
      }),
    );
    const parsed = transportOf(must(sent[0]).body);
    expect(parsed.transport?.x).toBeCloseTo(0, 4);
    expect(parsed.transport?.y).toBeCloseTo(10, 4);
    expect(parsed.transport?.z).toBeCloseTo(0, 4);
  });

  test("a missing pose refuses without sending", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    expect(() =>
      runtime.transportBoard(board({ poseAt: () => undefined })),
    ).toThrow("transport_data_missing");
    expect(sent).toHaveLength(0);
  });

  test("a moving transport refuses without sending", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    expect(() =>
      runtime.transportBoard(
        board({
          poseAt: () => ({
            mapId: 530,
            moving: true,
            orientation: 0,
            x: 8709.46,
            y: -6671.76,
            z: 70.34,
          }),
        }),
      ),
    ).toThrow("not_docked");
    expect(sent).toHaveLength(0);
  });

  test("leaving from a moving transport refuses", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    let moving = false;
    runtime.transportBoard(
      board({
        poseAt: () => ({
          mapId: 530,
          moving,
          orientation: 0,
          x: 8709.46,
          y: -6671.76,
          z: 70.34,
        }),
      }),
    );
    moving = true;
    expect(() => runtime.transportLeave()).toThrow("not_docked");
    expect(sent).toHaveLength(1);
  });

  test("a same-map world change keeps the transport ride", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    runtime.transportBoard(board());
    runtime.newWorld({
      mapId: 530,
      orientation: 0,
      x: 8709.46,
      y: -6671.76,
      z: 70.34,
    });
    sent.length = 0;
    runtime.forceRoot(6);
    const r = new PacketReader(must(sent.at(-1)).body);
    r.packedGuidBig();
    r.uint32LE();
    expect(parseMovementInfo(r).transport?.guid).toBe(TRANSPORT);
  });

  test("a cross-map world change ends the transport ride", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    runtime.transportBoard(board());
    runtime.newWorld({ mapId: 571, orientation: 0, x: 1, y: 2, z: 3 });
    sent.length = 0;
    runtime.forceRoot(6);
    const r = new PacketReader(must(sent.at(-1)).body);
    r.packedGuidBig();
    r.uint32LE();
    expect(parseMovementInfo(r).transport).toBeUndefined();
  });
});
