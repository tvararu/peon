import { describe, expect, test } from "bun:test";
import {
  FLIGHT_MS,
  FLYING,
  flightSpline,
  fly,
  LANDING,
  SELF,
  splineDones,
} from "#test-support/areas/travel-flight";
import { UnitFlag } from "#wow/protocol/entity-fields";

describe("self flight timers in control", () => {
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
