import { describe, expect, jest, test } from "bun:test";
import {
  chargeSpline,
  FLIGHT_MS,
  FLYING,
  type FlightFixture,
  flightSpline,
  fly,
  LANDING,
  stopSpline,
  TAKE_OFF,
} from "#test-support/areas/travel-flight";
import { LOGIN, lastMove, oracle, setup } from "#test-support/control-fixtures";
import { UnitFlag } from "#wow/protocol/entity-fields";

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
});
