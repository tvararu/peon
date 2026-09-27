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
  moveTo,
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

function followGoals(handle: MockHandle) {
  const goTo = driveGoto(handle, [
    {
      onArrive: () => {
        const target = goTo.mock.calls.at(-1)?.[0];
        if (target?.kind === "point") moveTo(handle, target);
      },
    },
  ]);
  return goTo;
}

function cellOf(target: unknown): string {
  const { x, y } = target as { x: number; y: number };
  return `${MAP_ID}:${Math.floor(x / 20)}:${Math.floor(y / 20)}`;
}

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

  test("keeps walking up to 100 yd when nothing new comes into view", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    const goTo = driveGoto(
      t.handle,
      [20, 40, 60, 80, 100].map((x) => ({ arrive: { x, y: 0 } })),
    );
    const result = await explore(toolCtx(t), { direction: "N" });
    expect(result).toMatchObject({ stoppedBy: "distance", walkedYd: 100 });
    expect(result.legs).toHaveLength(5);
    expect(goTo.mock.calls.at(-1)?.[0]).toEqual({
      kind: "point",
      x: 100,
      y: 0,
    });
    expect(t.rt.travel.explores).toEqual([
      { direction: "N", mapId: MAP_ID, x: 0, y: 0 },
    ]);
  });

  test("without a direction it avoids a bearing whose cells were explored farther out", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    for (const cell of [2, 3, 4, 5])
      t.rt.travel.visitedCells.add(`${MAP_ID}:${cell}:0`);
    driveGoto(t.handle, [
      {
        arrive: { x: 14, y: -14 },
        onArrive: () => setUnits(t.handle, [stalker]),
      },
    ]);
    const result = await explore(toolCtx(t), { direction: undefined });
    expect(result.direction).toBe("NE");
  });

  test("without a direction it heads away from the explore start", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 100, y: 0 });
    t.rt.travel.exploreOrigin = { mapId: MAP_ID, x: 0, y: 0 };
    const { pose } = t.handle.getControlState();
    if (pose) pose.orientation = Math.PI;
    driveGoto(t.handle, [
      {
        arrive: { x: 120, y: 0 },
        onArrive: () => setUnits(t.handle, [stalker]),
      },
    ]);
    const result = await explore(toolCtx(t), { direction: undefined });
    expect(result.direction).toBe("N");
  });

  test("without a direction it turns away from a crowd of friendly NPCs", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    const guards = [0x40n, 0x41n, 0x42n].map((guid) =>
      unitRow({
        distance: 30,
        guid,
        name: "Guard",
        relation: "friendly",
        x: 30,
        y: 0,
      }),
    );
    setUnits(t.handle, guards);
    driveGoto(t.handle, [
      {
        arrive: { x: 14, y: -14 },
        onArrive: () => setUnits(t.handle, [...guards, stalker]),
      },
    ]);
    const result = await explore(toolCtx(t), { direction: undefined });
    expect(result.direction).toBe("NE");
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
      unstuck: "failed",
      untried: "NE",
      walkedYd: 0,
    });
    expect(goTo.mock.calls.map((call) => call[0]).slice(0, 3)).toEqual([
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
      {
        arrive: { x: side + 20, y: -side },
        onArrive: () => setUnits(t.handle, [stalker]),
      },
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
      stoppedBy: "new_unit",
    });
    expect(result.walkedYd).toBeCloseTo(40, 0);
    expect(result.legs).toHaveLength(3);
  });

  test("a side refused for another reason still tries the other side", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    const side = 20 * Math.SQRT1_2;
    const goTo = driveGoto(t.handle, [
      { refuse: "unreachable: pathfind_find_path failed (UNKNOWN_HEIGHT)" },
      { refuse: "unreachable: pathfind_find_path failed (UNKNOWN_PATH)" },
      { arrive: { x: side, y: side } },
      { arrive: { x: side + 20, y: side } },
    ]);
    const result = await explore(toolCtx(t), { direction: "N" });
    expect(goTo.mock.calls.map((call) => call[0]).slice(0, 3)).toEqual([
      { kind: "point", x: 20, y: 0 },
      { kind: "point", x: side, y: -side },
      { kind: "point", x: side, y: side },
    ]);
    expect(result).toMatchObject({ direction: "N", obstructed: 0 });
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

describe("explore past explored cells", () => {
  test("turns aside instead of walking into cells explored before", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    const seeded = [3, 4, 5].map((cell) => `${MAP_ID}:${cell}:0`);
    for (const cell of seeded) t.rt.travel.visitedCells.add(cell);
    const goTo = followGoals(t.handle);
    const result = await explore(toolCtx(t), { direction: "N" });
    const cells = goTo.mock.calls.map((call) => cellOf(call[0]));
    expect(cells.filter((cell) => seeded.includes(cell))).toEqual([]);
    const side = 20 * Math.SQRT1_2;
    expect(goTo.mock.calls.at(2)?.[0]).toEqual({
      kind: "point",
      x: 40 + side,
      y: -side,
    });
    expect(result).toMatchObject({ direction: "N", stoppedBy: "distance" });
    expect(result.walkedYd).toBeCloseTo(100, 0);
  });

  test("a side bearing tried after a refusal skips explored cells too", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    t.rt.travel.visitedCells.add(`${MAP_ID}:0:-1`);
    const side = 20 * Math.SQRT1_2;
    const goTo = driveGoto(t.handle, [
      { refuse: "unreachable: end snapped off the navigation mesh" },
      {
        arrive: { x: side, y: side },
        onArrive: () => setUnits(t.handle, [stalker]),
      },
    ]);
    await explore(toolCtx(t), { direction: "N" });
    expect(goTo.mock.calls.slice(0, 2).map((call) => call[0])).toEqual([
      { kind: "point", x: 20, y: 0 },
      { kind: "point", x: side, y: side },
    ]);
  });

  test("stops without a leg when every bearing ahead was explored", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 10, y: 10 });
    for (const cell of ["1:0", "1:-1", "1:1", "0:-1", "0:1"])
      t.rt.travel.visitedCells.add(`${MAP_ID}:${cell}`);
    const goTo = followGoals(t.handle);
    const result = await explore(toolCtx(t), { direction: "N" });
    expect(goTo).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      stoppedBy: "explored",
      untried: "SE",
      walkedYd: 0,
    });
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

  test("with no good pose it routes to open ground away from the nearest object", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    setUnits(t.handle, [
      objectRow({ distance: 2, guid: 0x30n, name: "Signpost", x: 2, y: 0 }),
    ]);
    const walk = walked(t.handle, 0);
    const goTo = driveGoto(t.handle, [{ arrive: { x: -8, y: 0 } }]);
    const result = await unstick(toolCtx(t));
    expect(goTo).toHaveBeenCalledWith({ kind: "point", x: -8, y: 0 });
    expect(walk).not.toHaveBeenCalled();
    expect(result).toMatchObject({ movedYd: 8, toward: "open_ground" });
  });

  test("samples the other bearings when the first route is refused", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    walked(t.handle, 0);
    const goTo = driveGoto(t.handle, [
      { refuse: "unreachable: pathfind_find_path failed (UNKNOWN_PATH)" },
      { arrive: { x: -5.7, y: -5.7 } },
    ]);
    const result = await unstick(toolCtx(t));
    expect(goTo).toHaveBeenCalledTimes(2);
    expect(result.movedYd).toBeCloseTo(8, 0);
  });

  test("reports 0 yd when no bearing and no walk moves you", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    walked(t.handle, 0);
    const goTo = driveGoto(t.handle, [
      { refuse: "unreachable: pathfind_find_path failed (UNKNOWN_PATH)" },
    ]);
    const result = await unstick(toolCtx(t));
    expect(goTo).toHaveBeenCalledTimes(8);
    expect(result.movedYd).toBe(0);
  });
});

describe("explore from a faulted start", () => {
  test("moves off a start that refuses every leg the same way, then explores", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    const fault = "unreachable: pathfind_find_path failed (UNKNOWN_PATH)";
    const goTo = driveGoto(t.handle, [
      { refuse: fault },
      { refuse: fault },
      { refuse: fault },
      { arrive: { x: -8, y: 0 } },
      {
        arrive: { x: -8 + 10 * Math.SQRT2, y: -10 * Math.SQRT2 },
        onArrive: () => setUnits(t.handle, [stalker]),
      },
    ]);
    const result = await explore(toolCtx(t), { direction: "N" });
    expect(goTo.mock.calls[3]?.[0]).toEqual({ kind: "point", x: -8, y: 0 });
    expect(goTo.mock.calls[4]?.[0]).toEqual({
      kind: "point",
      x: -8 + 10 * Math.SQRT2,
      y: -10 * Math.SQRT2,
    });
    expect(result).toMatchObject({ stoppedBy: "new_unit", unstuck: "moved" });
    expect(result.walkedYd).toBeCloseTo(28, 0);
  });

  test("keeps the obstruction when moving off the start fails", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    walked(t.handle, 0);
    driveGoto(t.handle, [
      { refuse: "unreachable: pathfind_find_path failed (UNKNOWN_PATH)" },
    ]);
    const result = await explore(toolCtx(t), { direction: "N" });
    expect(result).toMatchObject({
      stoppedBy: "obstructed",
      unstuck: "failed",
      walkedYd: 0,
    });
  });
});
