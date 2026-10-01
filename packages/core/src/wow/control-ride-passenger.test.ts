import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { decodeMove, setup } from "#test-support/control-fixtures";
import type { ControlRuntime } from "#wow/control";
import { MovementFlag } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { SelfEvent } from "#wow/self-store";

const VEHICLE = 0xf1_30_00_3e_ea_00_0a_bcn;
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

function board(runtime: ControlRuntime, flags = 0): void {
  runtime.vehicleSeat(seat());
  runtime.clientControl({ allow: true, guid: VEHICLE });
  runtime.moverState({
    flags,
    guid: VEHICLE,
    pose: POSE,
    run: 12,
    runBack: 6,
    turn: 2,
  });
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("the passenger's flags while a vehicle is the mover", () => {
  test("a flight grant the character already had does not block a ground vehicle", () => {
    const { runtime } = setup();
    runtime.setCanFly(3, true);
    expect(runtime.snapshot().blockedReason).toBe("flying");
    board(runtime);
    expect(runtime.snapshot().movementAllowed).toBe(true);
    runtime.vehicleLeft();
    expect(runtime.snapshot().blockedReason).toBe("flying");
  });

  test("a flag change naming the character while driving waits for the ride's end", () => {
    const { runtime, sent } = setup();
    board(runtime);
    runtime.moveFlag("hover", true, 7);
    sent.length = 0;
    runtime.move("forward", 500);
    expect(decodeMove(sent[0]).flags & MovementFlag.HOVER).toBe(0);
    runtime.halt();
    runtime.vehicleLeft();
    sent.length = 0;
    runtime.move("forward", 500);
    expect(decodeMove(sent[0]).flags & MovementFlag.HOVER).toBe(
      MovementFlag.HOVER,
    );
    runtime.halt();
  });

  test("an observation of the character during the ride is kept for the release", () => {
    const { runtime } = setup();
    board(runtime);
    runtime.observeSelf({
      movementFlags: MovementFlag.CAN_FLY | MovementFlag.ON_TRANSPORT,
    });
    expect(runtime.snapshot().movementAllowed).toBe(true);
    runtime.vehicleLeft();
    expect(runtime.snapshot().blockedReason).toBe("flying");
  });

  test("a flight grant seen only in observed flags stays out of the vehicle's packets", () => {
    const { runtime, sent } = setup();
    runtime.observeSelf({ movementFlags: MovementFlag.CAN_FLY });
    board(runtime);
    sent.length = 0;
    runtime.move("forward", 500);
    const packet = decodeMove(sent[0]);
    expect(packet.guid).toBe(VEHICLE);
    expect(packet.flags & MovementFlag.CAN_FLY).toBe(0);
    runtime.halt();
    runtime.vehicleLeft();
    expect(runtime.snapshot().blockedReason).toBe("flying");
  });

  test("a vehicle grant revoked on top of a passenger grant frees the ground vehicle", () => {
    const { runtime } = setup();
    runtime.setCanFly(3, true);
    board(runtime);
    runtime.setCanFly(4, true);
    expect(runtime.snapshot().blockedReason).toBe("flying");
    runtime.setCanFly(5, false);
    expect(runtime.snapshot().movementAllowed).toBe(true);
    runtime.vehicleLeft();
    expect(() => runtime.setFlying(true)).not.toThrow();
  });

  test("the passenger's swimming state is restored after the ride", () => {
    const { runtime, sent } = setup();
    runtime.observeSelf({ movementFlags: MovementFlag.SWIMMING });
    const before = runtime.snapshot().blockedReason;
    expect(before).toBeDefined();
    board(runtime);
    expect(runtime.snapshot().movementAllowed).toBe(true);
    runtime.vehicleLeft();
    expect(runtime.snapshot().blockedReason).toBe(before);
    sent.length = 0;
    runtime.setSwimming(false);
    expect(sent.at(-1)?.opcode).toBe(GameOpcode.MSG_MOVE_STOP_SWIM);
  });
});

describe("air commands while driving", () => {
  const COMMANDS: readonly [string, (runtime: ControlRuntime) => void][] = [
    ["setSwimming(true)", (runtime) => runtime.setSwimming(true)],
    ["setSwimming(false)", (runtime) => runtime.setSwimming(false)],
    ["setFlying(true)", (runtime) => runtime.setFlying(true)],
    ["setFlying(false)", (runtime) => runtime.setFlying(false)],
    ["pitch up", (runtime) => runtime.pitch("up")],
    ["pitch value", (runtime) => runtime.pitch(0.2)],
    ["ascend", (runtime) => runtime.ascend("start")],
    ["descend", (runtime) => runtime.descend()],
  ];

  for (const [name, run] of COMMANDS)
    test(`${name} refuses without sending or changing state`, () => {
      const { runtime, sent } = setup();
      board(runtime);
      sent.length = 0;
      const before = runtime.snapshot();
      expect(() => run(runtime)).toThrow("driving");
      expect(sent).toHaveLength(0);
      expect(runtime.snapshot()).toEqual(before);
      runtime.move("forward", 500);
      const packet = decodeMove(sent[0]);
      expect(packet.guid).toBe(VEHICLE);
      expect(packet.flags & MovementFlag.SWIMMING).toBe(0);
      runtime.halt();
      runtime.vehicleLeft();
      expect(runtime.snapshot().movementAllowed).toBe(true);
    });

  test("swimming works before and after the drive, under the character's guid", () => {
    const { runtime, sent } = setup();
    runtime.setSwimming(true);
    runtime.setSwimming(false);
    board(runtime);
    expect(() => runtime.setSwimming(true)).toThrow("driving");
    runtime.vehicleLeft();
    sent.length = 0;
    runtime.setSwimming(true);
    expect(sent.at(-1)?.opcode).toBe(GameOpcode.MSG_MOVE_START_SWIM);
    expect(decodeMove(sent.at(-1)).guid).not.toBe(VEHICLE);
  });
});
