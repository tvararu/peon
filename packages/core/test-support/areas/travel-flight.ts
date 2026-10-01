import { jest } from "bun:test";
import {
  travelSelfFlightSplineBody,
  travelSelfFlightStopBody,
} from "#test-support/areas/travel";
import { LOGIN, type Sent, setup } from "#test-support/control-fixtures";
import type { ControlEvent, ControlRuntime } from "#wow/control";
import { UnitFlag } from "#wow/protocol/entity-fields";
import { type MonsterMove, parseMonsterMove } from "#wow/protocol/monster-move";
import { parseMovementInfo } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

export const SELF = 0x0764n;
export const TAKE_OFF = { x: LOGIN.x, y: LOGIN.y, z: LOGIN.z };
export const MIDDLE = { x: 8300, y: -6400, z: 120 };
export const LANDING = { x: 9400.5, y: -6800.25, z: 83.5 };
export const FLIGHT_MS = 60_000;
export const FLYING = UnitFlag.TAXI_FLIGHT | UnitFlag.DISABLE_MOVE;

export function flightSpline(
  over: { splineId?: number; durationMs?: number } = {},
): MonsterMove {
  return parseMonsterMove(
    new PacketReader(
      travelSelfFlightSplineBody({
        durationMs: over.durationMs ?? FLIGHT_MS,
        guid: SELF,
        points: [TAKE_OFF, MIDDLE, LANDING],
        splineId: over.splineId ?? 41,
      }),
    ),
  );
}

export function stopSpline(at: {
  x: number;
  y: number;
  z: number;
}): MonsterMove {
  return parseMonsterMove(
    new PacketReader(
      travelSelfFlightStopBody({ guid: SELF, splineId: 42, start: at }),
    ),
  );
}

export function chargeSpline(): MonsterMove {
  return {
    cyclic: false,
    duration: 800,
    extra: 0,
    facing: { kind: "none" },
    flags: 0,
    guid: SELF,
    interpolation: "linear",
    kind: "move",
    points: [TAKE_OFF, { x: TAKE_OFF.x + 10, y: TAKE_OFF.y, z: TAKE_OFF.z }],
    splineId: 9,
    start: TAKE_OFF,
  };
}

export function splineDones(sent: { opcode: number; body: Uint8Array }[]) {
  return sent
    .filter((p) => p.opcode === GameOpcode.CMSG_MOVE_SPLINE_DONE)
    .map((p) => {
      const r = new PacketReader(p.body);
      const guid = r.packedGuidBig();
      const info = parseMovementInfo(r);
      return { guid, info, splineId: r.uint32LE() };
    });
}

export type FlightFixture = {
  runtime: ControlRuntime;
  sent: Sent[];
  events: ControlEvent[];
  advance: (ms: number) => void;
};

export function fly(fn: (t: FlightFixture) => void): void {
  jest.useFakeTimers();
  try {
    fn(setup());
  } finally {
    jest.useRealTimers();
  }
}
