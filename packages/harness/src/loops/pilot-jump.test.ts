import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import type { GroundOracle, NavPoint } from "@peon/core";
import {
  LOGIN,
  lastMove,
  type Sent,
  setup,
} from "@peon/core/test-support/control-fixtures";
import { GameOpcode } from "@peon/core/test-support/internals";
import { PilotActions } from "#harness/loops/pilot-actions";
import {
  jumpOffered,
  poseOf,
  scanHeading,
} from "#harness/loops/pilot-geometry";
import { buildOptions } from "#harness/loops/pilot-options";
import type { PilotContext } from "#harness/loops/pilot-types";

const RAIL_YD = 5;
const RAIL_TOP_YD = 1.1;
const heading = LOGIN.orientation;
const along = (p: { x: number; y: number }) =>
  (p.x - LOGIN.x) * Math.cos(heading) + (p.y - LOGIN.y) * Math.sin(heading);

function rail(): GroundOracle {
  return {
    height: (_mapId, _x, _y, from) => from?.z ?? LOGIN.z,
    pathClear: (_mapId, a: NavPoint, b: NavPoint) => {
      const sa = along(a);
      const sb = along(b);
      if ((sa - RAIL_YD) * (sb - RAIL_YD) > 0 || sa === sb) return true;
      const t = (RAIL_YD - sa) / (sb - sa);
      const z = a.z + (b.z - a.z) * t;
      return z >= LOGIN.z + RAIL_TOP_YD;
    },
  };
}

const context: PilotContext = {
  instruction: "reach",
  objective: {
    kind: "reach",
    x: LOGIN.x + Math.cos(heading) * 12,
    y: LOGIN.y + Math.sin(heading) * 12,
  },
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function pilotAtRail() {
  const ground = rail();
  const f = setup({ ground });
  const actions = new PilotActions({
    control: f.runtime,
    ground,
    life: () => "alive",
  });
  return { ...f, actions };
}

function jumpIndex(sent: Sent[]): number {
  return sent.findIndex((packet) => packet.opcode === GameOpcode.MSG_MOVE_JUMP);
}

describe("pilot jumps", () => {
  test("a thin rail reads as one low obstacle at every approach distance", () => {
    const ground = rail();
    for (let s = 0; s <= 3.5; s += 0.05) {
      const pose = poseOf(
        {
          ...LOGIN,
          x: LOGIN.x + Math.cos(heading) * s,
          y: LOGIN.y + Math.sin(heading) * s,
        },
        7,
        false,
      );
      const ahead = scanHeading(ground, pose, heading);
      expect(ahead.blocker).toEqual({ kind: "low", topYd: 1.2 });
      if (s <= 2.5) expect(jumpOffered(ground, pose, ahead)).toBe(true);
      if (s >= 3.1) expect(jumpOffered(ground, pose, ahead)).toBe(false);
    }
  });

  test("a rail too close to jump stays faceable and back_up offers the run-up", () => {
    const ground = rail();
    const at = {
      ...LOGIN,
      x: LOGIN.x + Math.cos(heading) * 4.4,
      y: LOGIN.y + Math.sin(heading) * 4.4,
    };
    const sideways = poseOf(
      { ...at, orientation: heading + Math.PI / 2 },
      0,
      false,
    );
    const turn = buildOptions({
      ground,
      objective: context.objective,
      pose: sideways,
    }).find((option) => option.id === "turn_right");
    expect(turn?.input).toEqual({});
    const facing = poseOf(at, 0, false);
    const options = buildOptions({
      ground,
      objective: context.objective,
      pose: facing,
    });
    expect(options.map((option) => option.id)).not.toContain("jump_ahead");
    expect(
      options.find((option) => option.id === "back_up")?.description,
    ).toContain("run-up");
  });

  test("an armed jump leaves the ground before the rail and lands past it", () => {
    const { actions, advance, sent, runtime } = pilotAtRail();
    sent.length = 0;
    actions.execute("jump_ahead", context);
    for (let ms = 0; ms < 1400; ms += 25) advance(25);
    const index = jumpIndex(sent);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(
      sent.filter((packet) => packet.opcode === GameOpcode.MSG_MOVE_JUMP),
    ).toHaveLength(1);
    const takeoff = RAIL_YD - along(lastMove(sent.slice(0, index + 1)));
    expect(takeoff).toBeGreaterThanOrEqual(1);
    expect(takeoff).toBeLessThanOrEqual(3.5);
    expect(
      sent.some((packet) => packet.opcode === GameOpcode.MSG_MOVE_FALL_LAND),
    ).toBe(true);
    const pose = runtime.snapshot().pose;
    expect(pose && along(pose)).toBeGreaterThan(RAIL_YD);
  });

  test("another decision before the takeoff cancels the armed jump", () => {
    const { actions, advance, sent } = pilotAtRail();
    sent.length = 0;
    actions.execute("jump_ahead", context);
    advance(50);
    actions.execute("stop", context);
    for (let ms = 0; ms < 1400; ms += 25) advance(25);
    expect(jumpIndex(sent)).toBe(-1);
  });
});
