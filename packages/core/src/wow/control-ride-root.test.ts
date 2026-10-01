import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import {
  decodeMove,
  info,
  type Sent,
  setup,
} from "#test-support/control-fixtures";
import { must } from "#test-support/must";
import type { ControlRuntime } from "#wow/control";
import { MovementFlag, MovementFlagExtra } from "#wow/protocol/entity-fields";
import { parseMovementInfo } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";
import type { SelfEvent } from "#wow/self-store";

const VEHICLE = 0xf1_30_00_3e_ea_00_0a_bcn;
const POSE = { mapId: 530, orientation: 1, x: 100, y: 200, z: 50 };
const MOVER = {
  flags: 0,
  guid: VEHICLE,
  pose: POSE,
  run: 12,
  runBack: 6,
  turn: 2,
};

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

function lastMove(sent: Sent[]) {
  return decodeMove(
    must(
      sent
        .filter((packet) => packet.opcode !== GameOpcode.CMSG_MOVE_SPLINE_DONE)
        .at(-1),
    ),
  );
}

function boardLiveOrder(
  root: (target: ControlRuntime, counter: number) => void,
  extra?: (target: ControlRuntime, counter: number) => void,
) {
  const harness = setup();
  harness.runtime.vehicleSeat(seat());
  harness.runtime.clientControl({ allow: true, guid: VEHICLE });
  root(harness.runtime, 2);
  extra?.(harness.runtime, 3);
  harness.runtime.moverState(MOVER);
  return harness;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("roots received before the boarding spline", () => {
  test("the passenger's boarding root never reaches the vehicle's movement (live: spline, control update, force root)", () => {
    const { runtime, sent } = boardLiveOrder((target, counter) =>
      target.forceRoot(counter, 0x0764n),
    );
    expect(runtime.snapshot().movementAllowed).toBe(true);
    sent.length = 0;
    runtime.move("forward", 1000);
    const packet = lastMove(sent);
    expect(packet.guid).toBe(VEHICLE);
    expect(packet.flags & MovementFlag.FORWARD).not.toBe(0);
    expect(packet.flags & MovementFlag.ROOT).toBe(0);
  });

  test("the passenger's root comes back when the vehicle is lost", () => {
    const { runtime } = boardLiveOrder((target, counter) =>
      target.forceRoot(counter, 0x0764n),
    );
    runtime.clientControl({ allow: false, guid: VEHICLE });
    runtime.vehicleLeft();
    runtime.forceUnroot(4, 0x0764n);
    expect(runtime.snapshot().movementAllowed).toBe(true);
    expect(runtime.snapshot().blockedReason).not.toBe("rooted");
  });

  test("a vehicle root kept while its mover is pending still blocks the drive (spline, control update, vehicle root, passenger root)", () => {
    const { runtime, sent } = boardLiveOrder(
      (target, counter) => target.forceRoot(counter, VEHICLE),
      (target, counter) => target.forceRoot(counter, 0x0764n),
    );
    expect(runtime.snapshot().movementAllowed).toBe(false);
    expect(runtime.snapshot().blockedReason).toBe("rooted");
    sent.length = 0;
    expect(() => runtime.move("forward", 1000)).toThrow("rooted");
    expect(sent).toHaveLength(0);
    runtime.forceUnroot(4, VEHICLE);
    expect(runtime.snapshot().movementAllowed).toBe(true);
  });

  test("an unroot of the pending vehicle forgets its root", () => {
    const { runtime } = boardLiveOrder(
      (target, counter) => target.forceRoot(counter, VEHICLE),
      (target, counter) => target.forceUnroot(counter, VEHICLE),
    );
    expect(runtime.snapshot().movementAllowed).toBe(true);
  });

  test("a vehicle root pending when the ride ends does not leak into the next ride", () => {
    const harness = setup();
    harness.runtime.vehicleSeat(seat());
    harness.runtime.clientControl({ allow: true, guid: VEHICLE });
    harness.runtime.forceRoot(2, VEHICLE);
    harness.runtime.vehicleLeft();
    harness.runtime.vehicleSeat(seat());
    harness.runtime.clientControl({ allow: true, guid: VEHICLE });
    harness.runtime.moverState(MOVER);
    expect(harness.runtime.snapshot().movementAllowed).toBe(true);
  });
});

describe("roots already cached in the movement block", () => {
  test("a vehicle adopted with ROOT refuses without a root packet (MovementHandler.cpp:610-613)", () => {
    const { runtime, sent } = boardLiveOrder(() => undefined);
    runtime.moverState({ ...MOVER, flags: MovementFlag.ROOT });
    sent.length = 0;
    expect(() => runtime.move("forward", 1000)).toThrow("rooted");
    expect(sent).toHaveLength(0);
  });

  test("an unroot packet naming the vehicle releases the seeded root", () => {
    const { runtime } = boardLiveOrder(() => undefined);
    runtime.moverState({ ...MOVER, flags: MovementFlag.ROOT });
    runtime.forceUnroot(4, VEHICLE);
    expect(runtime.snapshot().movementAllowed).toBe(true);
  });

  test("an unroot seen before adoption wins over the cached ROOT flag", () => {
    const harness = setup();
    harness.runtime.vehicleSeat(seat());
    harness.runtime.clientControl({ allow: true, guid: VEHICLE });
    harness.runtime.forceUnroot(4, VEHICLE);
    harness.runtime.moverState({ ...MOVER, flags: MovementFlag.ROOT });
    expect(harness.runtime.snapshot().movementAllowed).toBe(true);
  });
});

describe("forced pose corrections", () => {
  const FALL = { cosAngle: 0.5, sinAngle: 0.25, xySpeed: 3, zSpeed: -7 };

  test("a correction without ROOT clears a cached passenger root", () => {
    const { runtime } = setup();
    runtime.forceRoot(1);
    expect(runtime.snapshot().blockedReason).toBe("rooted");
    runtime.nearTeleport(info({ flags: 0 }));
    expect(runtime.snapshot().blockedReason).not.toBe("rooted");
  });

  test("a correction with ROOT blocks movement even when none was cached", () => {
    const { runtime } = setup();
    runtime.nearTeleport(info({ flags: MovementFlag.ROOT }));
    expect(runtime.snapshot().blockedReason).toBe("rooted");
    expect(() => runtime.move("forward", 1000)).toThrow("rooted");
    runtime.forceUnroot(2);
    expect(runtime.snapshot().blockedReason).not.toBe("rooted");
  });

  test("fall of a correction reaches the next outgoing movement", () => {
    const { runtime, sent } = setup();
    runtime.nearTeleport(
      info({ fall: FALL, fallTime: 0, flags: MovementFlag.FALLING }),
    );
    sent.length = 0;
    runtime.resetFall();
    const packet = lastMove(sent);
    expect(packet.flags & MovementFlag.FALLING).toBe(0);
  });

  test("pitch of a correction reaches the next outgoing movement", () => {
    const { runtime, sent } = setup();
    runtime.nearTeleport(
      info({
        extraFlags: MovementFlagExtra.ALWAYS_ALLOW_PITCHING,
        fallTime: 0,
        pitch: 0.5,
      }),
    );
    sent.length = 0;
    runtime.face(1.5);
    const packet = lastMove(sent);
    expect(packet.pitch).toBeCloseTo(0.5, 5);
  });
});

describe("unroot ack of a driven vehicle", () => {
  function ackFlags(packet: Sent | undefined): number {
    const r = new PacketReader(must(packet).body);
    r.packedGuidBig();
    r.uint32LE();
    return parseMovementInfo(r).flags;
  }

  test("a rooted passenger does not leak its ROOT into the vehicle's unroot ack", () => {
    const { runtime, sent } = boardLiveOrder(() => undefined);
    runtime.observeSelf({
      movementFlags: MovementFlag.ROOT | MovementFlag.ON_TRANSPORT,
    });
    runtime.forceRoot(2, VEHICLE);
    sent.length = 0;
    runtime.forceUnroot(3, VEHICLE);
    const ack = must(
      sent.find(
        (packet) => packet.opcode === GameOpcode.CMSG_FORCE_MOVE_UNROOT_ACK,
      ),
    );
    expect(ackFlags(ack) & MovementFlag.ROOT).toBe(0);
    expect(runtime.snapshot().movementAllowed).toBe(true);
    runtime.clientControl({ allow: false, guid: VEHICLE });
    runtime.vehicleLeft();
    expect(runtime.snapshot().blockedReason).toBe("rooted");
  });
});
