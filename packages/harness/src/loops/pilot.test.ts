import { describe, expect, test } from "bun:test";
import type { ControlState, GroundOracle } from "@peon/core";
import { PILOT_DEADMAN_MS, PilotActions } from "#harness/loops/pilot-actions";
import {
  circleOutcome,
  freshMemory,
  reachOutcome,
} from "#harness/loops/pilot-frame";
import {
  PILOT_JUMP_FAR_YD,
  PILOT_JUMP_HIGH_YD,
  PILOT_JUMP_LOW_YD,
  PILOT_JUMP_NEAR_YD,
  poseOf,
} from "#harness/loops/pilot-geometry";
import { buildOptions } from "#harness/loops/pilot-options";
import type { PilotContext } from "#harness/loops/pilot-types";

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

function fence(): GroundOracle {
  return {
    height: (_mapId, x, _y, from) => {
      if (x > 2 && x < 3) return 0.8;
      return from?.z ?? 0;
    },
    pathClear: (_mapId, from, to) => {
      const blocked = (x: number, z: number) =>
        x > 2 && x < 3 && z < 0.8 + 0.25;
      return !(
        blocked(from.x, from.z) ||
        blocked(to.x, to.z) ||
        blocked((from.x + to.x) / 2, (from.z + to.z) / 2)
      );
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

  test("jump gate bounds match the contract", () => {
    expect(PILOT_JUMP_NEAR_YD).toBe(1);
    expect(PILOT_JUMP_FAR_YD).toBe(3);
    expect(PILOT_JUMP_LOW_YD).toBe(0.3);
    expect(PILOT_JUMP_HIGH_YD).toBe(1.4);
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

  test("jump_ahead drives forward and jumps", () => {
    const { actions, calls } = actionsWith(fence(), [stateAt(0)]);
    actions.execute("jump_ahead", reach(30));
    expect(calls.drive).toEqual([[{ move: "forward" }, PILOT_DEADMAN_MS]]);
    expect(calls.jumps).toBe(1);
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
});

describe("pilot outcomes", () => {
  test("reach completes within 1.5 yd", () => {
    expect(reachOutcome({ kind: "reach", x: 10, y: 0 }, 9, 0, false)).toEqual({
      reason: "goal_reached",
      status: "completed",
    });
    expect(
      reachOutcome({ kind: "reach", x: 10, y: 0 }, 0, 0, false),
    ).toBeUndefined();
  });

  test("death fails the run", () => {
    expect(reachOutcome({ kind: "reach", x: 10, y: 0 }, 0, 0, true)).toEqual({
      reason: "self_dead",
      status: "failed",
    });
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
});
