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

  test("a leg on two floors walks on the floor nearest your height", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 8735, y: -6685, z: 21.3 });
    const goTo = driveGoto(t.handle, [
      {
        floors: [21.1, 34.8],
        refuse: "pick_destination: ambiguous ground column at destination",
      },
      { arrive: { x: 8755, y: -6685, z: 21.1 } },
      { arrive: { x: 8775, y: -6685, z: 21.1 } },
    ]);
    const result = await explore(toolCtx(t), { direction: "N" });
    expect(goTo).toHaveBeenNthCalledWith(2, {
      kind: "point",
      x: 8755,
      y: -6685,
      z: 21.1,
    });
    expect(result).toMatchObject({ obstructed: 0, stoppedBy: "distance" });
    expect(result.legs[0]).toMatchObject({ status: "arrived" });
  });

  test("a refused leg keeps its full length and stops after 3 obstructed legs", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    const goTo = driveGoto(t.handle, [
      { refuse: "unreachable: pathfind_find_path failed (UNKNOWN_PATH)" },
    ]);
    const result = await explore(toolCtx(t), { direction: "N" });
    expect(result).toMatchObject({
      obstructed: 3,
      stoppedBy: "obstructed",
      untried: "NE",
      walkedYd: 0,
    });
    expect(goTo.mock.calls.map((call) => call[0])).toEqual([
      { kind: "point", x: 20, y: 0 },
      { kind: "point", x: 20, y: 0 },
      { kind: "point", x: 20, y: 0 },
    ]);
    expect(t.rt.travel.blockedBearings.get(`${MAP_ID}:0:0`)).toEqual(
      new Set(["N"]),
    );
  });

  test("a ledge tries both side bearings at full length before it counts", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    const goTo = driveGoto(t.handle, [
      { refuse: "unreachable: pathfind_find_path failed (UNKNOWN_HEIGHT)" },
    ]);
    const result = await explore(toolCtx(t), { direction: "N" });
    expect(result).toMatchObject({
      obstructed: 3,
      stoppedBy: "obstructed",
      untried: "E",
    });
    const side = 20 * Math.SQRT1_2;
    expect(goTo.mock.calls.map((call) => call[0])).toEqual([
      { kind: "point", x: 20, y: 0 },
      { kind: "point", x: side, y: -side },
      { kind: "point", x: side, y: side },
      { kind: "point", x: 20, y: 0 },
      { kind: "point", x: 20, y: 0 },
    ]);
    expect(t.rt.travel.blockedBearings.get(`${MAP_ID}:0:0`)).toEqual(
      new Set(["N", "NE", "NW"]),
    );
  });

  test("a side bearing that arrives keeps the original bearing for the next leg", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    const side = 20 * Math.SQRT1_2;
    const goTo = driveGoto(t.handle, [
      { refuse: "unreachable: end snapped off the navigation mesh" },
      { arrive: { x: side, y: -side } },
      { arrive: { x: side + 20, y: -side } },
    ]);
    const result = await explore(toolCtx(t), { direction: "N" });
    expect(goTo.mock.calls.map((call) => call[0])).toEqual([
      { kind: "point", x: 20, y: 0 },
      { kind: "point", x: side, y: -side },
      { kind: "point", x: 34.1, y: -14.1 },
    ]);
    expect(result).toMatchObject({
      direction: "N",
      obstructed: 0,
      stoppedBy: "distance",
    });
    expect(result.walkedYd).toBeCloseTo(40, 0);
  });

  test("without a direction it skips a bearing refused from this cell", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    t.rt.travel.blockedBearings.set(`${MAP_ID}:0:0`, new Set(["N"]));
    driveGoto(t.handle, [
      {
        arrive: { x: 14, y: -14 },
        onArrive: () => setUnits(t.handle, [stalker]),
      },
    ]);
    const result = await explore(toolCtx(t), { direction: undefined });
    expect(result.direction).toBe("NE");
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
