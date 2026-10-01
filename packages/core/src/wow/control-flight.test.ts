import { describe, expect, jest, test } from "bun:test";
import {
  travelSelfFlightSplineBody,
  travelSelfFlightStopBody,
} from "#test-support/areas/travel";
import {
  LOGIN,
  lastMove,
  type Sent,
  setup,
} from "#test-support/control-fixtures";
import type { ControlEvent, ControlRuntime } from "#wow/control";
import { UnitFlag } from "#wow/protocol/entity-fields";
import { type MonsterMove, parseMonsterMove } from "#wow/protocol/monster-move";
import { parseMovementInfo } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

const SELF = 0x0764n;
const TAKE_OFF = { x: LOGIN.x, y: LOGIN.y, z: LOGIN.z };
const MIDDLE = { x: 8300, y: -6400, z: 120 };
const LANDING = { x: 9400.5, y: -6800.25, z: 83.5 };
const FLIGHT_MS = 60_000;
const FLYING = UnitFlag.TAXI_FLIGHT | UnitFlag.DISABLE_MOVE;

function flightSpline(
  over: { splineId?: number; durationMs?: number } = {},
): MonsterMove {
  return parseMonsterMove(
    new PacketReader(
      travelSelfFlightSplineBody({
        guid: SELF,
        points: [TAKE_OFF, MIDDLE, LANDING],
        durationMs: over.durationMs ?? FLIGHT_MS,
        splineId: over.splineId ?? 41,
      }),
    ),
  );
}

function stopSpline(at: { x: number; y: number; z: number }): MonsterMove {
  return parseMonsterMove(
    new PacketReader(
      travelSelfFlightStopBody({ guid: SELF, start: at, splineId: 42 }),
    ),
  );
}

function chargeSpline(): MonsterMove {
  return {
    kind: "move",
    guid: SELF,
    extra: 0,
    start: TAKE_OFF,
    splineId: 9,
    facing: { kind: "none" },
    flags: 0,
    duration: 800,
    points: [TAKE_OFF, { x: TAKE_OFF.x + 10, y: TAKE_OFF.y, z: TAKE_OFF.z }],
    interpolation: "linear",
    cyclic: false,
  };
}

function splineDones(sent: { opcode: number; body: Uint8Array }[]) {
  return sent
    .filter((p) => p.opcode === GameOpcode.CMSG_MOVE_SPLINE_DONE)
    .map((p) => {
      const r = new PacketReader(p.body);
      const guid = r.packedGuidBig();
      const info = parseMovementInfo(r);
      return { guid, info, splineId: r.uint32LE() };
    });
}

type FlightFixture = {
  runtime: ControlRuntime;
  sent: Sent[];
  events: ControlEvent[];
  advance: (ms: number) => void;
};

function fly(fn: (t: FlightFixture) => void): void {
  jest.useFakeTimers();
  try {
    fn(setup());
  } finally {
    jest.useRealTimers();
  }
}

describe("self flight spline in control", () => {
  test("a flying spline aborts local motion and reports in_flight", () => {
    fly(({ runtime, events }) => {
      runtime.move("forward", 5000);
      expect(runtime.snapshot().moving).toBe(true);
      events.length = 0;
      runtime.observeSelfSpline(flightSpline());
      const state = runtime.snapshot();
      expect(state.moving).toBe(false);
      expect(state.blockedReason).toBe("in_flight");
      expect(state.movementAllowed).toBe(false);
      expect(
        events.filter(
          (e) => e.type === "control_changed" && e.reason === "in_flight",
        ).length,
      ).toBeGreaterThan(0);
    });
  });

  test("move, walk and face requests refuse with in_flight, not disable_move", () => {
    fly(({ runtime }) => {
      runtime.observeSelfSpline(flightSpline());
      runtime.observeSelf({ unitFlags: FLYING });
      expect(() => runtime.move("forward", 1000)).toThrow("in_flight");
      expect(() => runtime.face(1)).toThrow("in_flight");
      expect(() => runtime.walkToward({ ...LANDING }, 5)).toThrow("in_flight");
      expect(runtime.snapshot().blockedReason).toBe("in_flight");
    });
  });

  test("the flag alone reports in_flight and never disable_move", () => {
    fly(({ runtime, events }) => {
      events.length = 0;
      runtime.observeSelf({ unitFlags: FLYING });
      const reasons = events
        .filter((e) => e.type === "control_changed")
        .map((e) => e.reason);
      expect(reasons).toEqual(["in_flight"]);
      expect(runtime.snapshot().blockedReason).toBe("in_flight");
    });
  });

  test("a non-flight self spline keeps its current handling", () => {
    fly(({ runtime, events }) => {
      events.length = 0;
      runtime.observeSelfSpline(chargeSpline());
      expect(runtime.snapshot().blockedReason).toBeUndefined();
      expect(events).toEqual([]);
    });
  });

  test("the flag clearing without a stop spline lands at the last spline point", () => {
    fly(({ runtime, events }) => {
      runtime.observeSelfSpline(flightSpline());
      runtime.observeSelf({ unitFlags: FLYING });
      events.length = 0;
      runtime.observeSelf({ unitFlags: 0 });
      const landed = events.filter(
        (e) => e.type === "server_correction" && e.reason === "flight_landed",
      );
      expect(landed).toHaveLength(1);
      const pose = runtime.snapshot().serverPose;
      expect(pose?.x).toBeCloseTo(LANDING.x, 2);
      expect(pose?.y).toBeCloseTo(LANDING.y, 2);
      expect(pose?.z).toBeCloseTo(LANDING.z, 2);
      expect(pose?.mapId).toBe(530);
      expect(runtime.snapshot().blockedReason).toBeUndefined();
    });
  });

  test("a stop spline during the flight sets the server pose to the stop point", () => {
    fly(({ runtime }) => {
      runtime.observeSelfSpline(flightSpline());
      runtime.observeSelf({ unitFlags: FLYING });
      runtime.observeSelfSpline(stopSpline({ x: 8800, y: -6500, z: 99 }));
      const pose = runtime.snapshot().serverPose;
      expect(pose?.x).toBeCloseTo(8800, 2);
      expect(pose?.z).toBeCloseTo(99, 2);
      expect(runtime.snapshot().blockedReason).toBe("in_flight");
    });
  });

  test("a stop spline outside a flight changes nothing", () => {
    fly(({ runtime, events }) => {
      events.length = 0;
      runtime.observeSelfSpline(stopSpline({ x: 1, y: 2, z: 3 }));
      expect(runtime.snapshot().serverPose?.x).toBeCloseTo(LOGIN.x, 2);
      expect(events).toEqual([]);
    });
  });

  test("the first move after landing starts from the landing point", () => {
    fly(({ runtime, sent, advance }) => {
      runtime.observeSelfSpline(flightSpline());
      runtime.observeSelf({ unitFlags: FLYING });
      runtime.observeSelf({ unitFlags: 0 });
      sent.length = 0;
      runtime.move("forward", 2000);
      const start = lastMove(sent);
      expect(start.x).toBeCloseTo(LANDING.x, 1);
      expect(start.y).toBeCloseTo(LANDING.y, 1);
      expect(Math.abs(start.x - TAKE_OFF.x)).toBeGreaterThan(500);
      advance(300);
      runtime.halt();
    });
  });

  test("with the flag never seen, the flight ends ten seconds after the duration", () => {
    fly(({ runtime, events, advance }) => {
      runtime.observeSelfSpline(flightSpline());
      events.length = 0;
      advance(FLIGHT_MS + 9000);
      expect(runtime.snapshot().blockedReason).toBe("in_flight");
      advance(1500);
      expect(runtime.snapshot().blockedReason).toBeUndefined();
      expect(runtime.snapshot().serverPose?.x).toBeCloseTo(LANDING.x, 2);
      expect(events.filter((e) => e.reason === "flight_landed")).toHaveLength(
        1,
      );
    });
  });

  test("sends exactly one spline-done with the final point when the flag is still set", () => {
    fly(({ runtime, sent, advance }) => {
      runtime.observeSelfSpline(flightSpline({ splineId: 77 }));
      runtime.observeSelf({ unitFlags: FLYING });
      advance(FLIGHT_MS - 1);
      expect(splineDones(sent)).toHaveLength(0);
      advance(2);
      advance(30_000);
      const dones = splineDones(sent);
      expect(dones).toHaveLength(1);
      expect(dones[0]?.guid).toBe(SELF);
      expect(dones[0]?.splineId).toBe(77);
      expect(dones[0]?.info.x).toBeCloseTo(LANDING.x, 2);
      expect(dones[0]?.info.y).toBeCloseTo(LANDING.y, 2);
      expect(dones[0]?.info.z).toBeCloseTo(LANDING.z, 2);
    });
  });

  test("sends no spline-done when the flag cleared before the duration", () => {
    fly(({ runtime, sent, advance }) => {
      runtime.observeSelfSpline(flightSpline());
      runtime.observeSelf({ unitFlags: FLYING });
      advance(FLIGHT_MS - 5000);
      runtime.observeSelf({ unitFlags: 0 });
      advance(20_000);
      expect(splineDones(sent)).toHaveLength(0);
    });
  });

  test("sends no spline-done when the flag was never seen", () => {
    fly(({ runtime, sent, advance }) => {
      runtime.observeSelfSpline(flightSpline());
      advance(FLIGHT_MS + 20_000);
      expect(splineDones(sent)).toHaveLength(0);
    });
  });

  test("disposing the runtime cancels the pending flight timers", () => {
    fly(({ runtime, sent, advance }) => {
      runtime.observeSelfSpline(flightSpline());
      runtime.observeSelf({ unitFlags: FLYING });
      runtime.dispose();
      advance(FLIGHT_MS + 20_000);
      expect(splineDones(sent)).toHaveLength(0);
    });
  });

  test("a second flight spline replaces the first one's timers and id", () => {
    fly(({ runtime, sent, advance }) => {
      runtime.observeSelfSpline(flightSpline({ splineId: 1 }));
      runtime.observeSelf({ unitFlags: FLYING });
      advance(40_000);
      runtime.observeSelfSpline(flightSpline({ splineId: 2 }));
      advance(30_000);
      expect(splineDones(sent)).toHaveLength(0);
      advance(31_000);
      const dones = splineDones(sent);
      expect(dones.map((d) => d.splineId)).toEqual([2]);
    });
  });

  test("a multi-map flight stays in_flight across the transfer and resumes on the new spline", () => {
    fly(({ runtime, sent, advance }) => {
      runtime.observeSelfSpline(flightSpline({ splineId: 5 }));
      runtime.observeSelf({ unitFlags: FLYING });
      runtime.handleTransferPending();
      expect(runtime.snapshot().blockedReason).toBe("teleporting");
      runtime.newWorld({ mapId: 0, x: 100, y: 200, z: 50, orientation: 0 });
      expect(runtime.snapshot().blockedReason).toBe("in_flight");
      runtime.observeSelfSpline(flightSpline({ splineId: 6 }));
      expect(runtime.snapshot().blockedReason).toBe("in_flight");
      sent.length = 0;
      advance(FLIGHT_MS + 1);
      expect(splineDones(sent).map((d) => d.splineId)).toEqual([6]);
      runtime.observeSelf({ unitFlags: 0 });
      expect(runtime.snapshot().blockedReason).toBeUndefined();
    });
  });

  test("a landing after a map change ignores a spline point from another map", () => {
    fly(({ runtime }) => {
      runtime.observeSelfSpline(flightSpline());
      runtime.observeSelf({ unitFlags: FLYING });
      runtime.newWorld({ mapId: 0, x: 100, y: 200, z: 50, orientation: 0 });
      runtime.observeSelf({ unitFlags: 0 });
      const pose = runtime.snapshot().serverPose;
      expect(pose?.mapId).toBe(0);
      expect(pose?.x).toBeCloseTo(100, 2);
    });
  });
});
