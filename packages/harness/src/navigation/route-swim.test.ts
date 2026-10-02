import { describe, expect, jest, test } from "bun:test";
import { GameOpcode } from "@peon/core/test-support/internals";
import { must } from "@peon/core/test-support/must";
import {
  native,
  navigation,
  routeSetup,
} from "#test-support/navigation-fixtures";

const BED = -3;
const SURFACE = -0.2;

const inRiver = (x: number, base: number) => x >= base + 6 && x < base + 14;

function river(base: number, start: number) {
  const bed = (x: number) => (inRiver(x, base) ? start + BED : start);
  return native({
    findHeight: (_from, x) => bed(x),
    findHeights: (x) => [bed(x)],
    findLiquid: (point) =>
      inRiver(point.x, base) ? start + SURFACE : undefined,
  });
}

function swimOpcodes(sent: { opcode: number }[]): number[] {
  return sent
    .filter(
      (packet) =>
        packet.opcode === GameOpcode.MSG_MOVE_START_SWIM ||
        packet.opcode === GameOpcode.MSG_MOVE_STOP_SWIM,
    )
    .map((packet) => packet.opcode);
}

function crossing() {
  const f = routeSetup();
  const start = must(f.runtime.snapshot().pose);
  const goal = { x: start.x + 20, y: start.y, z: start.z };
  const route = navigation(river(start.x, start.z)).plan(
    start.mapId,
    start,
    goal,
  );
  return { ...f, goal, route, start };
}

describe("a route through water", () => {
  test("toggles swimming on entering and leaving the water and keeps moving", () => {
    jest.useFakeTimers();
    try {
      const { runtime, advance, sent, route, goal } = crossing();
      runtime.navigate(route, goal);
      advance(500);
      expect(swimOpcodes(sent)).toEqual([]);
      advance(1000);
      expect(swimOpcodes(sent)).toEqual([GameOpcode.MSG_MOVE_START_SWIM]);
      expect(runtime.navigationState().active).toBe(true);
      advance(1500);
      expect(swimOpcodes(sent)).toEqual([
        GameOpcode.MSG_MOVE_START_SWIM,
        GameOpcode.MSG_MOVE_STOP_SWIM,
      ]);
      expect(runtime.navigationState().active).toBe(false);
      expect(runtime.navigationState().blockedReason).toBeUndefined();
      expect(runtime.snapshot().movementAllowed).toBe(true);
      expect(must(runtime.snapshot().pose).x).toBeCloseTo(goal.x, 0);
    } finally {
      jest.useRealTimers();
    }
  });

  test("stopping in the water ends the swim state", () => {
    jest.useFakeTimers();
    try {
      const { runtime, advance, sent, route, goal } = crossing();
      runtime.navigate(route, goal);
      advance(1500);
      expect(swimOpcodes(sent)).toEqual([GameOpcode.MSG_MOVE_START_SWIM]);
      runtime.halt();
      expect(swimOpcodes(sent)).toEqual([
        GameOpcode.MSG_MOVE_START_SWIM,
        GameOpcode.MSG_MOVE_STOP_SWIM,
      ]);
      expect(runtime.snapshot().movementAllowed).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test("a dry route sends no swim packets", () => {
    jest.useFakeTimers();
    try {
      const f = routeSetup();
      const start = must(f.runtime.snapshot().pose);
      const goal = { x: start.x + 10, y: start.y, z: start.z };
      const route = navigation(
        native({
          findHeight: () => start.z,
          findHeights: () => [start.z],
        }),
      ).plan(start.mapId, start, goal);
      f.runtime.navigate(route, goal);
      f.advance(5000);
      expect(swimOpcodes(f.sent)).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });
});
