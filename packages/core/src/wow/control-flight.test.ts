import { describe, expect, jest, test } from "bun:test";
import {
  travelSelfFlightSplineBody,
  travelSelfFlightStopBody,
} from "#test-support/areas/travel";
import {
  LOGIN,
  lastMove,
  type Sent,
  oracle,
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

  describe("landing onto the ground", () => {
    const HOVER = 2.34;

    function landWith(
      height: (x: number, y: number) => number | undefined,
      check: (t: FlightFixture) => void,
    ): void {
      jest.useFakeTimers();
      try {
        const t = setup({
          ground: oracle({
            height: (_map, x, y, from) => (from ? from.z : height(x, y)),
          }),
        });
        t.runtime.observeSelfSpline(flightSpline());
        t.runtime.observeSelf({ unitFlags: FLYING });
        t.runtime.observeSelf({ unitFlags: 0 });
        check(t);
      } finally {
        jest.useRealTimers();
      }
    }

    test("a landing a few yards above the ground takes the ground height at the landing x, y", () => {
      landWith(
        () => LANDING.z - HOVER,
        ({ runtime }) => {
          const pose = runtime.snapshot().serverPose;
          expect(pose?.x).toBeCloseTo(LANDING.x, 2);
          expect(pose?.y).toBeCloseTo(LANDING.y, 2);
          expect(pose?.z).toBeCloseTo(LANDING.z - HOVER, 2);
          expect(runtime.snapshot().pose?.z).toBeCloseTo(LANDING.z - HOVER, 2);
        },
      );
    });

    test("the oracle is asked at the landing point on the landing map", () => {
      const asked: [number, number][] = [];
      landWith(
        (x, y) => {
          asked.push([x, y]);
          return LANDING.z - HOVER;
        },
        () => {
          expect(asked).toEqual([
            [expect.closeTo(LANDING.x, 2), expect.closeTo(LANDING.y, 2)],
          ]);
        },
      );
    });

    test("the first move after landing starts at the ground height", () => {
      landWith(
        () => LANDING.z - HOVER,
        ({ runtime, sent, advance }) => {
          sent.length = 0;
          runtime.move("forward", 2000);
          expect(lastMove(sent).z).toBeCloseTo(LANDING.z - HOVER, 1);
          advance(300);
          runtime.halt();
        },
      );
    });

    test.each([
      ["a ground height far below", () => LANDING.z - 13],
      ["a ground height above the landing", () => LANDING.z + 3],
      ["an unknown ground height", () => undefined],
      ["a non-finite ground height", () => Number.NaN],
    ])("%s leaves the landing z alone", (_name, height) => {
      landWith(height, ({ runtime }) => {
        expect(runtime.snapshot().serverPose?.z).toBeCloseTo(LANDING.z, 2);
      });
    });

    test("with no ground oracle the landing z is the spline point", () => {
      jest.useFakeTimers();
      try {
        const t = setup({ ground: undefined });
        t.runtime.observeSelfSpline(flightSpline());
        t.runtime.observeSelf({ unitFlags: FLYING });
        t.runtime.observeSelf({ unitFlags: 0 });
        expect(t.runtime.snapshot().serverPose?.z).toBeCloseTo(LANDING.z, 2);
      } finally {
        jest.useRealTimers();
      }
    });

    test("the fallback landing after the duration grounds the pose the same way", () => {
      jest.useFakeTimers();
      try {
        const t = setup({
          ground: oracle({
            height: (_map, _x, _y, from) => (from ? from.z : LANDING.z - HOVER),
          }),
        });
        t.runtime.observeSelfSpline(flightSpline());
        t.advance(FLIGHT_MS + 10_500);
        expect(t.runtime.snapshot().serverPose?.z).toBeCloseTo(
          LANDING.z - HOVER,
          2,
        );
      } finally {
        jest.useRealTimers();
      }
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

  test("landing after a stop at a different point leaves the stop point and the next move starts there", () => {
    fly(({ runtime, sent }) => {
      const STOP = { x: 8800, y: -6500, z: 99 };
      runtime.observeSelfSpline(flightSpline());
      runtime.observeSelf({ unitFlags: FLYING });
      runtime.observeSelfSpline(stopSpline(STOP));
      runtime.observeSelf({ unitFlags: 0 });
      const pose = runtime.snapshot().serverPose;
      expect(pose?.x).toBeCloseTo(STOP.x, 2);
      expect(pose?.y).toBeCloseTo(STOP.y, 2);
      expect(pose?.z).toBeCloseTo(STOP.z, 2);
      sent.length = 0;
      runtime.move("forward", 2000);
      const start = lastMove(sent);
      expect(start.x).toBeCloseTo(STOP.x, 1);
      expect(start.y).toBeCloseTo(STOP.y, 1);
      expect(Math.abs(start.x - LANDING.x)).toBeGreaterThan(100);
      runtime.halt();
    });
  });

  test("a non-flight self update with disable_move still blocks local movement", () => {
    fly(({ runtime }) => {
      runtime.observeSelf({ unitFlags: UnitFlag.DISABLE_MOVE });
      expect(runtime.snapshot().blockedReason).toBe("disable_move");
      expect(() => runtime.move("forward", 1000)).toThrow("disable_move");
      runtime.observeSelf({ unitFlags: 0 });
      expect(runtime.snapshot().blockedReason).toBeUndefined();
    });
  });

  test("a landing update that keeps a blocker stays blocked", () => {
    fly(({ runtime, sent }) => {
      runtime.observeSelfSpline(flightSpline());
      runtime.observeSelf({ unitFlags: FLYING | UnitFlag.STUNNED });
      expect(runtime.snapshot().blockedReason).toBe("in_flight");
      runtime.observeSelf({ unitFlags: UnitFlag.STUNNED });
      expect(runtime.snapshot().serverPose?.x).toBeCloseTo(LANDING.x, 2);
      expect(runtime.snapshot().blockedReason).toBe("disable_move");
      expect(() => runtime.move("forward", 1000)).toThrow("disable_move");
      sent.length = 0;
      runtime.observeSelf({ unitFlags: 0 });
      expect(runtime.snapshot().blockedReason).toBeUndefined();
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

  test("a landing with a retained blocker publishes disable_move in every landing event", () => {
    fly(({ runtime, events }) => {
      runtime.observeSelfSpline(flightSpline());
      runtime.observeSelf({ unitFlags: FLYING | UnitFlag.STUNNED });
      events.length = 0;
      runtime.observeSelf({ unitFlags: UnitFlag.STUNNED });
      const landing = events.filter(
        (e) => e.type === "control_changed" || e.type === "server_correction",
      );
      expect(landing.length).toBeGreaterThan(0);
      for (const event of landing) {
        expect(event.state.movementAllowed).toBe(false);
        expect(event.state.blockedReason).toBe("disable_move");
      }
    });
  });

  test("flight start events already report in_flight and no movement", () => {
    fly(({ runtime, events }) => {
      events.length = 0;
      runtime.observeSelf({ unitFlags: FLYING });
      const started = events.filter((e) => e.reason === "in_flight");
      expect(started.length).toBeGreaterThan(0);
      for (const event of started) {
        expect(event.state.movementAllowed).toBe(false);
        expect(event.state.blockedReason).toBe("in_flight");
      }
    });
  });

  for (const [name, flag] of [
    ["stunned", UnitFlag.STUNNED],
    ["confused", UnitFlag.CONFUSED],
    ["fleeing", UnitFlag.FLEEING],
    ["disable_move", UnitFlag.DISABLE_MOVE],
  ] as const) {
    test(`the no-flag fallback landing keeps a ${name} blocker`, () => {
      fly(({ runtime, advance }) => {
        runtime.observeSelfSpline(flightSpline());
        runtime.observeSelf({ unitFlags: flag });
        expect(runtime.snapshot().blockedReason).toBe("in_flight");
        advance(FLIGHT_MS + 10_500);
        expect(runtime.snapshot().blockedReason).toBe("disable_move");
        expect(() => runtime.move("forward", 1000)).toThrow("disable_move");
        expect(() => runtime.face(1)).toThrow("disable_move");
      });
    });
  }

  for (const [name, flag] of [
    ["stunned", UnitFlag.STUNNED],
    ["confused", UnitFlag.CONFUSED],
    ["fleeing", UnitFlag.FLEEING],
    ["disable_move", UnitFlag.DISABLE_MOVE],
  ] as const) {
    test(`a replacement spline keeps the ${name} blocker seen during the flight`, () => {
      fly(({ runtime, advance }) => {
        runtime.observeSelfSpline(flightSpline({ splineId: 1 }));
        runtime.observeSelf({ unitFlags: flag });
        runtime.observeSelfSpline(flightSpline({ splineId: 2 }));
        expect(runtime.snapshot().blockedReason).toBe("in_flight");
        advance(FLIGHT_MS + 10_500);
        expect(runtime.snapshot().blockedReason).toBe("disable_move");
        expect(() => runtime.move("forward", 1000)).toThrow("disable_move");
      });
    });
  }

  test("a new flight after landing does not inherit the earlier blocker", () => {
    fly(({ runtime, advance }) => {
      runtime.observeSelfSpline(flightSpline({ splineId: 1 }));
      runtime.observeSelf({ unitFlags: UnitFlag.STUNNED });
      advance(FLIGHT_MS + 10_500);
      runtime.observeSelf({ unitFlags: 0 });
      runtime.observeSelfSpline(flightSpline({ splineId: 2 }));
      advance(FLIGHT_MS + 10_500);
      expect(runtime.snapshot().blockedReason).toBeUndefined();
      expect(() => runtime.move("forward", 1000)).not.toThrow();
    });
  });

  test("a taxi flag arriving after the duration sends spline-done and never lands by fallback", () => {
    fly(({ runtime, sent, advance }) => {
      runtime.observeSelfSpline(flightSpline({ splineId: 88 }));
      advance(FLIGHT_MS + 1000);
      expect(splineDones(sent)).toHaveLength(0);
      runtime.observeSelf({ unitFlags: FLYING });
      const dones = splineDones(sent);
      expect(dones.map((d) => d.splineId)).toEqual([88]);
      expect(dones[0]?.info.x).toBeCloseTo(LANDING.x, 2);
      advance(20_000);
      expect(runtime.snapshot().blockedReason).toBe("in_flight");
      runtime.observeSelf({ unitFlags: 0 });
      expect(runtime.snapshot().blockedReason).toBeUndefined();
      expect(runtime.snapshot().serverPose?.x).toBeCloseTo(LANDING.x, 2);
    });
  });

  test("a flag-first flight landing with no flags clears the blocker for moves", () => {
    fly(({ runtime }) => {
      runtime.observeSelf({ unitFlags: FLYING });
      runtime.observeSelf({ unitFlags: FLYING });
      runtime.observeSelf({ unitFlags: 0 });
      expect(runtime.snapshot().blockedReason).toBeUndefined();
      expect(() => runtime.move("forward", 1000)).not.toThrow();
      expect(() => runtime.face(1)).not.toThrow();
    });
  });

  test("a blocker cleared during the flight is not restored by the fallback landing", () => {
    fly(({ runtime, advance }) => {
      runtime.observeSelfSpline(flightSpline());
      runtime.observeSelf({ unitFlags: UnitFlag.STUNNED });
      runtime.observeSelf({ unitFlags: 0 });
      advance(FLIGHT_MS + 10_500);
      expect(runtime.snapshot().blockedReason).toBeUndefined();
      expect(() => runtime.move("forward", 1000)).not.toThrow();
    });
  });

  test("a taxi-bearing flags update after the duration send does not send a second spline-done", () => {
    fly(({ runtime, sent, advance }) => {
      runtime.observeSelfSpline(flightSpline({ splineId: 91 }));
      runtime.observeSelf({ unitFlags: FLYING });
      advance(FLIGHT_MS + 1000);
      expect(splineDones(sent)).toHaveLength(1);
      runtime.observeSelf({ unitFlags: FLYING });
      expect(splineDones(sent)).toHaveLength(1);
    });
  });
});
