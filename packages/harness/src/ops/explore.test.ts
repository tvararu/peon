import { describe, expect, jest, test } from "bun:test";
import type { Compass, PoseView } from "#harness/contract/views";
import {
  explore,
  parseDirection,
  UNSTICK_MAX_YD,
  unstick,
} from "#harness/ops/explore";
import {
  driveGoto,
  MAP_ID,
  objectRow,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

const stalker = unitRow({
  distance: 22,
  guid: 0x20n,
  level: 7,
  name: "Springpaw Stalker",
  x: 40,
  y: 0,
});

function walked(handle: MockHandle, traveled: number) {
  const walk = jest.fn(async () => ({
    pose: {
      mapId: MAP_ID,
      orientation: 0,
      source: "server" as const,
      updatedAt: 0,
      x: 0,
      y: 0,
      z: 0,
    },
    status: "completed" as const,
    traveled,
  }));
  handle.walkToward = walk;
  return walk;
}

const directions: [string, Compass | undefined][] = [
  ["explore north", "N"],
  ["northeast", "NE"],
  ["explore  South", "S"],
  ["NW", "NW"],
  ["explore", undefined],
  ["up", undefined],
];

describe("parseDirection", () => {
  test.each(directions)("%s -> %s", (text, want) => {
    expect(parseDirection(text)).toBe(want);
  });
});

describe("explore", () => {
  test("walks planned point legs with no z and stops on a new hostile", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    const goTo = driveGoto(t.handle, [
      {
        arrive: { x: 20, y: 0 },
        onArrive: () => setUnits(t.handle, [stalker]),
      },
    ]);
    const result = await explore(toolCtx(t), { direction: "N" });
    expect(goTo).toHaveBeenCalledWith({ kind: "point", x: 20, y: 0 });
    expect(result).toMatchObject({
      direction: "N",
      obstructed: 0,
      stoppedBy: "new_unit",
      walkedYd: 20,
    });
    expect(result.newInView.map((unit) => unit.name)).toEqual([
      "Springpaw Stalker",
    ]);
    expect(t.rt.travel.visitedCells.has(`${MAP_ID}:1:0`)).toBe(true);
  });

  test("stops after 40 yd when nothing new comes into view", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    driveGoto(t.handle, [
      { arrive: { x: 20, y: 0 } },
      { arrive: { x: 40, y: 0 } },
    ]);
    const result = await explore(toolCtx(t), { direction: "N" });
    expect(result).toMatchObject({ stoppedBy: "distance", walkedYd: 40 });
    expect(result.legs).toHaveLength(2);
  });

  test("halves the leg after each refusal and stops after 3 obstructed legs", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    const goTo = driveGoto(t.handle, [
      { refuse: "unreachable: pathfind_find_path failed (UNKNOWN_PATH)" },
    ]);
    const result = await explore(toolCtx(t), { direction: "N" });
    expect(result).toMatchObject({
      obstructed: 3,
      stoppedBy: "obstructed",
      walkedYd: 0,
    });
    expect(goTo.mock.calls.map((call) => call[0])).toEqual([
      { kind: "point", x: 20, y: 0 },
      { kind: "point", x: 10, y: 0 },
      { kind: "point", x: 5, y: 0 },
    ]);
  });

  test("without a direction it turns to the nearest unvisited cell", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    t.rt.travel.visitedCells.add(`${MAP_ID}:1:0`);
    driveGoto(t.handle, [
      {
        arrive: { x: 14, y: -14 },
        onArrive: () => setUnits(t.handle, [stalker]),
      },
    ]);
    const result = await explore(toolCtx(t), { direction: undefined });
    expect(result.direction).toBe("NE");
  });
});

describe("unstick", () => {
  const good: PoseView = {
    ageMs: 0,
    facing: "N",
    mapId: MAP_ID,
    serverFixAgeMs: 0,
    source: "server",
    x: 3,
    y: 4,
    z: 0,
  };

  test("walks at most 5 yd toward the last good pose and names the refused goal", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    t.rt.travel.lastGoodPose = good;
    t.rt.travel.lastRefusedGoal = "u4";
    const walk = walked(t.handle, 4.8);
    const ctx = toolCtx(t);
    const result = await unstick(ctx);
    expect(walk).toHaveBeenCalledWith(
      { kind: "point", x: 3, y: 4, z: 0 },
      UNSTICK_MAX_YD,
      ctx.signal,
    );
    expect(result).toEqual({
      movedYd: 4.8,
      refusedGoal: "u4",
      toward: "last_good_pose",
    });
  });

  test("with no good pose it walks away from the nearest object", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    setUnits(t.handle, [
      objectRow({ distance: 2, guid: 0x30n, name: "Signpost", x: 2, y: 0 }),
    ]);
    const walk = walked(t.handle, 5);
    const ctx = toolCtx(t);
    const result = await unstick(ctx);
    expect(walk).toHaveBeenCalledWith(
      { kind: "point", x: -5, y: 0, z: 0 },
      UNSTICK_MAX_YD,
      ctx.signal,
    );
    expect(result.toward).toBe("away_from_object");
  });
});
