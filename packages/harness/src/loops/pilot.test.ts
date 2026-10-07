import { describe, expect, test } from "bun:test";
import type { ControlState, GroundOracle } from "@peon/core";
import { PILOT_DEADMAN_MS, PilotActions } from "#harness/loops/pilot-actions";
import {
  circleOutcome,
  describeSurroundings,
  freshMemory,
  reachOutcome,
} from "#harness/loops/pilot-frame";
import { lapPoint, poseOf } from "#harness/loops/pilot-geometry";
import { buildOptions, scanCache } from "#harness/loops/pilot-options";
import type { PilotContext } from "#harness/loops/pilot-types";
import type { AggroCircle } from "#harness/loops/pilot-units";
import type { TacticsFrame } from "#harness/loops/tactics";

function flat(height = 0): GroundOracle {
  return {
    height: (_mapId, _x, _y, from) => from?.z ?? height,
    pathClear: () => true,
  };
}

function wallAt(distanceYd: number): GroundOracle {
  return {
    height: (_mapId, x, _y, from) => {
      if (x > distanceYd) return;
      return from?.z ?? 0;
    },
    pathClear: (_mapId, from, to) => {
      const mid = (from.x + to.x) / 2;
      return mid < distanceYd;
    },
  };
}

function fence(at = 2.5): GroundOracle {
  return {
    height: (_mapId, _x, _y, from) => from?.z ?? 0,
    pathClear: (_mapId, from, to) => {
      if ((from.x - at) * (to.x - at) > 0 || from.x === to.x) return true;
      const t = (at - from.x) / (to.x - from.x);
      return from.z + (to.z - from.z) * t >= 1.05;
    },
  };
}

function sideWall(): GroundOracle {
  return {
    height: (_mapId, _x, y, from) => {
      if (y > 1) return;
      return from?.z ?? 0;
    },
    pathClear: (_mapId, from, to) => {
      const mid = (from.y + to.y) / 2;
      return mid < 1;
    },
  };
}

function tallWall(): GroundOracle {
  return {
    height: (_mapId, x, _y, from) => {
      if (x > 1 && x < 2) return 2;
      return from?.z ?? 0;
    },
    pathClear: (_mapId, from, to) => {
      const midX = (from.x + to.x) / 2;
      const midZ = (from.z + to.z) / 2;
      if (midX > 1 && midX < 2 && midZ < 2) return false;
      return true;
    },
  };
}

function stateAt(
  x: number,
  orientation = 0,
  over: Partial<ControlState> = {},
): ControlState {
  return {
    airborne: false,
    blockedReason: undefined,
    input: {},
    movementAllowed: true,
    mover: undefined,
    moving: false,
    pose: {
      mapId: 530,
      orientation,
      source: "server",
      updatedAt: 0,
      x,
      y: 0,
      z: 0,
    },
    requestedTarget: undefined,
    selfGuid: 1n,
    serverPose: undefined,
    speed: 7,
    target: undefined,
    ...over,
  };
}

function actionsWith(ground: GroundOracle | undefined, states: ControlState[]) {
  let index = 0;
  const calls: {
    face: number[];
    drive: unknown[];
    jumps: number;
    halts: number;
  } = {
    drive: [],
    face: [],
    halts: 0,
    jumps: 0,
  };
  const control = {
    drive: (input: unknown, durationMs: number) => {
      calls.drive.push([input, durationMs]);
    },
    face: (orientation: number) => {
      calls.face.push(orientation);
    },
    halt: () => {
      calls.halts += 1;
    },
    jump: () => {
      calls.jumps += 1;
    },
    settle: () => {},
    snapshot: () => states[Math.min(index, states.length - 1)] as ControlState,
  };
  const actions = new PilotActions({
    control,
    ground,
    life: () => "alive",
  });
  const advance = () => {
    index += 1;
  };
  return { actions, advance, calls, control };
}

const reach = (x: number): PilotContext => ({
  instruction: "reach",
  objective: { kind: "reach", x, y: 0 },
});

describe("pilot options", () => {
  test("open ground offers every movement option and stop", () => {
    const pose = poseOf(
      { mapId: 530, orientation: 0, x: 0, y: 0, z: 0 },
      7,
      false,
    );
    const options = buildOptions({
      ground: flat(),
      objective: { kind: "reach", x: 30, y: 0 },
      pose,
    });
    const ids = options.map((o) => o.id);
    for (const id of [
      "run_ahead",
      "veer_left",
      "veer_right",
      "turn_left",
      "turn_right",
      "turn_around",
      "strafe_left",
      "strafe_right",
      "back_up",
      "stop",
    ])
      expect(ids).toContain(id);
    expect(ids).not.toContain("jump_ahead");
  });

  test("strafe and back-up bearings use the motion direction, not the facing", () => {
    const pose = poseOf(
      { mapId: 530, orientation: 0, x: 0, y: 0, z: 0 },
      7,
      false,
    );
    const options = buildOptions({
      ground: flat(),
      objective: { kind: "reach", x: 30, y: 0 },
      pose,
    });
    const goalDeg = (id: string) =>
      options.find((option) => option.id === id)?.goalDeg;
    expect(goalDeg("run_ahead")).toBe(0);
    expect(goalDeg("strafe_left")).toBe(90);
    expect(goalDeg("strafe_right")).toBe(90);
    expect(goalDeg("back_up")).toBe(180);
  });

  test("escaping one range into another masks the move", () => {
    const pose = poseOf(
      { mapId: 530, orientation: 0, x: 0, y: 0, z: 0 },
      7,
      false,
    );
    const inner: AggroCircle = { name: "A", radiusYd: 10, x: -5, y: 0 };
    const outer: AggroCircle = { name: "B", radiusYd: 7, x: 8, y: 0 };
    const objective = { kind: "reach", x: 30, y: 0 } as const;
    const escaped = buildOptions({
      circles: [inner],
      ground: flat(),
      objective,
      pose,
    }).map((option) => option.id);
    expect(escaped).toContain("run_ahead");
    const trapped = buildOptions({
      circles: [inner, outer],
      ground: flat(),
      objective,
      pose,
    }).map((option) => option.id);
    expect(trapped).not.toContain("run_ahead");
  });

  test("a wall 1 yd ahead masks every forward option but keeps stop", () => {
    const pose = poseOf(
      { mapId: 530, orientation: 0, x: 0, y: 0, z: 0 },
      7,
      false,
    );
    const options = buildOptions({
      ground: wallAt(1),
      objective: { kind: "reach", x: 30, y: 0 },
      pose,
    });
    const ids = options.map((o) => o.id);
    expect(ids).toContain("stop");
    expect(ids).not.toContain("run_ahead");
    expect(ids).not.toContain("jump_ahead");
  });

  test("airborne offers no candidates and no call", () => {
    const pose = poseOf(
      { mapId: 530, orientation: 0, x: 0, y: 0, z: 0 },
      7,
      true,
    );
    expect(
      buildOptions({
        ground: flat(),
        objective: { kind: "reach", x: 30, y: 0 },
        pose,
      }),
    ).toEqual([]);
  });

  test("a low fence inside 1-3 yd offers jump_ahead when the arc clears", () => {
    const pose = poseOf(
      { mapId: 530, orientation: 0, x: 0, y: 0, z: 0 },
      7,
      false,
    );
    const options = buildOptions({
      ground: fence(),
      objective: { kind: "reach", x: 30, y: 0 },
      pose,
    });
    expect(options.map((o) => o.id)).toContain("jump_ahead");
  });

  test("a tall wall never offers jump_ahead", () => {
    const wall = tallWall();
    const pose = poseOf(
      { mapId: 530, orientation: 0, x: 0, y: 0, z: 0 },
      7,
      false,
    );
    const options = buildOptions({
      ground: wall,
      objective: { kind: "reach", x: 30, y: 0 },
      pose,
    });
    expect(options.map((o) => o.id)).not.toContain("jump_ahead");
  });

  test("a wall on the left reads as left, not right", () => {
    const pose = poseOf(
      { mapId: 530, orientation: 0, x: 0, y: 0, z: 0 },
      7,
      false,
    );
    const slots = describeSurroundings(scanCache(sideWall(), pose), pose);
    expect(slots[2]).toMatch(/^left: /);
    expect(slots[2]).toMatch(/a wall/);
    expect(slots[6]).toMatch(/^right: /);
  });

  test("a foe objective names the target distance in option text", () => {
    const pose = poseOf(
      { mapId: 530, orientation: 0, x: 0, y: 0, z: 0 },
      7,
      false,
    );
    const options = buildOptions({
      circles: [{ name: "Boar", radiusYd: 3, x: 20, y: 0 }],
      ground: flat(),
      jump: false,
      objective: { kind: "foe", x: 20, y: 0 },
      pose,
    });
    const ids = options.map((o) => o.id);
    for (const id of ["run_ahead", "back_up", "stop"]) expect(ids).toContain(id);
    expect(ids).not.toContain("jump_ahead");
    const ahead = options.find((o) => o.id === "run_ahead");
    expect(ahead?.description).toContain("20 yd");
    expect(ahead?.description).toContain("target");
    expect(options.find((o) => o.id === "stop")?.description).toContain("target");
  });
});

describe("pilot execute", () => {
  test("run_ahead faces the heading and drives the dead-man lease", () => {
    const { actions, calls } = actionsWith(flat(), [stateAt(0)]);
    actions.execute("run_ahead", reach(30));
    expect(calls.face).toEqual([0]);
    expect(calls.drive).toEqual([[{ move: "forward" }, PILOT_DEADMAN_MS]]);
    expect(calls.jumps).toBe(0);
  });

  test("a turn faces the new orientation before driving", () => {
    const { actions, calls } = actionsWith(flat(), [stateAt(0)]);
    actions.execute("turn_left", reach(30));
    expect(calls.face[0]).toBeCloseTo(Math.PI / 2, 5);
    expect(calls.drive).toEqual([[{ move: "forward" }, PILOT_DEADMAN_MS]]);
  });

  test("strafes and back_up keep the facing and move off a wall ahead", () => {
    const { actions, calls } = actionsWith(wallAt(1), [stateAt(0)]);
    for (const id of ["strafe_left", "strafe_right", "back_up"])
      actions.execute(id, reach(30));
    expect(calls.face).toEqual([0, 0, 0]);
    expect(calls.drive).toEqual([
      [{ strafe: "left" }, PILOT_DEADMAN_MS],
      [{ strafe: "right" }, PILOT_DEADMAN_MS],
      [{ move: "backward" }, PILOT_DEADMAN_MS],
    ]);
  });

  test("stop halts and drives nothing", () => {
    const { actions, calls } = actionsWith(flat(), [stateAt(0)]);
    actions.execute("stop", reach(30));
    expect(calls.halts).toBe(1);
    expect(calls.drive).toEqual([]);
  });

  test("an unknown action throws", () => {
    const { actions } = actionsWith(flat(), [stateAt(0)]);
    expect(() => actions.execute("wait", reach(30))).toThrow(
      "unknown_pilot_action",
    );
  });

  test("travel lands on the previous decision, not the new one", () => {
    const { actions, advance } = actionsWith(flat(), [
      stateAt(0),
      stateAt(1.6),
    ]);
    actions.execute("run_ahead", reach(30));
    advance();
    actions.execute("run_ahead", reach(30));
    const observed = actions.observe(reach(30));
    const self = observed.observation["self"];
    expect(self).toMatch(/run_ahead moved 1.6 yd; run_ahead in progress/);
  });

  test("a committed frame survives a world change before execute", () => {
    let current = flat();
    const ground: GroundOracle = {
      height: (...args) => current.height(...args),
      pathClear: (...args) => current.pathClear(...args),
    };
    const { actions, calls } = actionsWith(ground, [stateAt(0)]);
    const context = reach(30);
    actions.commit(context);
    current = wallAt(0.3);
    expect(actions.observe(context).candidates.map((c) => c.id)).not.toContain(
      "run_ahead",
    );
    expect(() => actions.execute("run_ahead", context)).not.toThrow();
    expect(calls.drive).toEqual([[{ move: "forward" }, PILOT_DEADMAN_MS]]);
  });
});

describe("pilot outcomes", () => {
  const goal = { kind: "reach" as const, x: 10, y: 0 };

  test("reach completes within 1.5 yd", () => {
    expect(
      reachOutcome({ at: { x: 9, y: 0 }, dead: false, objective: goal }),
    ).toEqual({ reason: "goal_reached", status: "completed" });
    expect(
      reachOutcome({ at: { x: 0, y: 0 }, dead: false, objective: goal }),
    ).toBeUndefined();
  });

  test("reach completes when the path since the last frame passed the goal", () => {
    const passed = { at: { x: 12, y: 1 }, dead: false, objective: goal };
    expect(reachOutcome({ ...passed, from: { x: 8, y: 1 } })).toEqual({
      reason: "goal_reached",
      status: "completed",
    });
    expect(reachOutcome({ ...passed, from: { x: 8, y: 3 } })).toBeUndefined();
  });

  test("death fails the run", () => {
    expect(
      reachOutcome({ at: { x: 0, y: 0 }, dead: true, objective: goal }),
    ).toEqual({ reason: "self_dead", status: "failed" });
  });

  test("a circle completes after a full sweep back at the start", () => {
    const objective = {
      direction: "counterclockwise" as const,
      kind: "circle" as const,
      radius: 10,
      x: 0,
      y: 0,
    };
    const memory = freshMemory();
    expect(
      circleOutcome({ dead: false, memory, objective, x: 10, y: 0 }),
    ).toBeUndefined();
    memory.sweptRad = Math.PI * 2;
    const done = circleOutcome({ dead: false, memory, objective, x: 10, y: 0 });
    expect(done).toEqual({ reason: "lap_completed", status: "completed" });
  });

  test("a circle far from the start pose stays open", () => {
    const objective = {
      direction: "counterclockwise" as const,
      kind: "circle" as const,
      radius: 10,
      x: 0,
      y: 0,
    };
    const memory = freshMemory();
    circleOutcome({ dead: false, memory, objective, x: 10, y: 0 });
    memory.sweptRad = Math.PI * 2;
    expect(
      circleOutcome({ dead: false, memory, objective, x: -10, y: 0 }),
    ).toBeUndefined();
  });

  test("back-and-forth jitter cannot complete a lap", () => {
    const objective = {
      direction: "counterclockwise" as const,
      kind: "circle" as const,
      radius: 10,
      x: 0,
      y: 0,
    };
    const memory = freshMemory();
    circleOutcome({ dead: false, memory, objective, x: 10, y: 0 });
    for (let leg = 0; leg < 40; leg += 1) {
      circleOutcome({ dead: false, memory, objective, x: 9, y: 1 });
      circleOutcome({ dead: false, memory, objective, x: 10, y: 0 });
    }
    expect(memory.sweptRad).toBeLessThan(0.5);
    expect(
      circleOutcome({ dead: false, memory, objective, x: 10, y: 0.5 }),
    ).toBeUndefined();
  });

  test.each(["counterclockwise", "clockwise"] as const)(
    "chasing the next lap point completes a %s lap",
    (direction) => {
      const objective = {
        direction,
        kind: "circle" as const,
        radius: 10,
        x: 0,
        y: 0,
      };
      const memory = freshMemory();
      let at = { x: 10, y: 0 };
      let done: TacticsFrame["outcome"];
      let steps = 0;
      let widest = 0;
      do {
        done = circleOutcome({ dead: false, memory, objective, ...at });
        const next = lapPoint(objective, at);
        const away = Math.hypot(next.x - at.x, next.y - at.y);
        at = {
          x: at.x + (next.x - at.x) / away,
          y: at.y + (next.y - at.y) / away,
        };
        if (steps > 10)
          widest = Math.max(widest, Math.abs(Math.hypot(at.x, at.y) - 10));
        steps += 1;
      } while (!done && steps < 200);
      expect(done).toEqual({ reason: "lap_completed", status: "completed" });
      expect(steps).toBeLessThan(90);
      expect(widest).toBeLessThan(2);
    },
  );
});
