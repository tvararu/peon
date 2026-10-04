import { afterAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import type { NavPoint } from "@peon/core";
import { navigationSource } from "#harness/navigation/maps";
import { createNavigation, type Navigation } from "#harness/navigation/planner";
import { native, navigation } from "#test-support/navigation-fixtures";

const dataPath = process.env["NAV_DATA"] ?? "";
const libraryPath = process.env["NAV_LIB"] ?? "";
const present =
  dataPath !== "" &&
  libraryPath !== "" &&
  existsSync(dataPath) &&
  existsSync(libraryPath);

const pose: NavPoint = { x: 0, y: 0, z: 0 };
const goal: NavPoint = { x: 10, y: 0, z: 0 };
function platformRays(top: number, fromX: number) {
  return (a: NavPoint, b: NavPoint) => {
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      if (x >= fromX && z < top) return false;
    }
    return true;
  };
}

function meshStartingAt(onto: NavPoint, blocked = false) {
  return native({
    findPath: (_from, to) => [{ ...onto }, { ...to }],
    lineOfSight: (a, b) =>
      !(blocked && a.x === pose.x && a.y === pose.y && b.x === onto.x),
  });
}

describe("a start just off the mesh", () => {
  test("walks the short step onto the mesh first, then on to the goal", () => {
    const onto = { x: 0.2, y: 0.1, z: 0.1 };
    const route = navigation(meshStartingAt(onto)).plan(0, pose, goal);
    expect(route.points[0]).toMatchObject(pose);
    expect(route.points[1]).toMatchObject({ x: onto.x, y: onto.y });
    expect(route.points.at(-1)).toMatchObject({ x: goal.x, y: goal.y });
    expect(route.sample(0)).toMatchObject(pose);
    const last = route.sample(route.length);
    expect(last.x).toBeCloseTo(goal.x);
    expect(last.y).toBeCloseTo(goal.y);
  });

  test("refuses when the step onto the mesh is blocked", () => {
    const onto = { x: 0.2, y: 0.1, z: 0.1 };
    expect(() =>
      navigation(meshStartingAt(onto, true)).plan(0, pose, goal),
    ).toThrow(/start snapped off/);
  });

  test("refuses a start that snaps several yards away", () => {
    const onto = { x: 3, y: 0, z: 0 };
    expect(() => navigation(meshStartingAt(onto)).plan(0, pose, goal)).toThrow(
      /start snapped off/,
    );
  });

  test("plans ground routes from such a start too", () => {
    const onto = { x: 0.2, y: 0.1, z: 0.1 };
    const route = navigation(meshStartingAt(onto)).planGround(0, pose, {
      x: goal.x,
      y: goal.y,
    });
    expect(route.points.at(-1)).toMatchObject({ x: goal.x, y: goal.y });
  });

  test("refuses a lead whose straight walk crosses a low platform", () => {
    const onto = { x: 0.3, y: 0, z: 0.3 };
    const map = native({
      findHeights: (x, y) => (y === 0 && x >= 0.02 ? [0.3] : [0]),
      findPath: (_from, to) => [{ ...onto }, { ...to }],
      lineOfSight: platformRays(0.3, 0.02),
    });
    expect(() => navigation(map).plan(0, pose, { x: 10, y: 1, z: 0 })).toThrow(
      /start snapped off/,
    );
  });

  test.each([
    ["no floor under the lead", [-10]],
    ["a low ceiling over the lead floor", [0, 1]],
  ])("refuses a lead crossing %s", (_label, column) => {
    const onto = { x: 0.4, y: 0, z: 0 };
    const map = native({
      findHeights: (x) => (x > 0.1 && x < 0.3 ? column : [0]),
      findPath: (_from, to) => [{ ...onto }, { ...to }],
    });
    expect(() => navigation(map).plan(0, pose, goal)).toThrow(
      /start snapped off/,
    );
  });

  test("refuses a lead whose interior gap misses the plan-time midpoint", () => {
    const onto = { x: 0.4, y: 0, z: 0 };
    const map = native({
      findHeights: (x) => (x > 0.04 && x < 0.12 ? [-10] : [0]),
      findPath: (_from, to) => [{ ...onto }, { ...to }],
    });
    expect(() => navigation(map).plan(0, pose, goal)).toThrow(
      /start snapped off/,
    );
  });

  test("allows a supported lead beneath a separate upper floor", () => {
    const onto = { x: 0.2, y: 0, z: 0 };
    const map = native({
      findHeights: () => [0, 10],
      findPath: (_from, to) => [{ ...onto }, { ...to }],
    });
    const route = navigation(map).plan(0, pose, goal);
    expect(route.points[0]).toMatchObject(pose);
    expect(route.points.at(-1)).toMatchObject({ x: goal.x, y: goal.y });
    expect(route.sample(0.1)).toMatchObject({ x: 0.1, y: 0, z: 0 });
  });

  test("steps down off a ledge under a distant canopy, every sample on a floor", () => {
    const start = { x: 0, y: 0, z: 0.4 };
    const onto = { x: 0.03, y: 0, z: -0.04 };
    const column = (x: number) =>
      x < 0.0225 ? [-0.08, 0.45, 12, 18] : [-0.08, 12, 18];
    const map = native({
      findHeights: (x) => column(x),
      findPath: (_from, to) => [{ ...onto }, { ...to }],
    });
    const route = navigation(map).plan(0, start, goal);
    expect(route.points[1]).toMatchObject({ x: onto.x });
    for (let at = 0.003; at <= 0.03; at += 0.003) {
      const sample = route.sample(at);
      expect(column(sample.x)).toContain(sample.z);
    }
    expect(route.sample(0.003)).toMatchObject({ x: 0.003, y: 0, z: 0.45 });
  });

  test("refuses a lead whose pose has no floor within step height below", () => {
    const onto = { x: 0.2, y: 0, z: 0 };
    const map = native({
      findHeights: () => [-3, 10],
      findPath: (_from, to) => [{ ...onto }, { ...to }],
    });
    expect(() => navigation(map).plan(0, pose, goal)).toThrow(
      /ground height|snapped off/,
    );
  });
});

describe.skipIf(!present)("recorded off-mesh starts on the real mesh", () => {
  let opened: Navigation | undefined;
  const nav = () => {
    opened ??= createNavigation(
      navigationSource({ dataDir: dataPath, library: libraryPath }).open,
    );
    return opened;
  };
  afterAll(() => opened?.close());

  test("Sunspire start 0.44 yd above the mesh plans to the unstick goal", () => {
    const route = nav().plan(
      530,
      { x: 10_408.6, y: -6337.8, z: 37.4 },
      { x: 10_402.9, y: -6343.5, z: 36.9 },
    );
    expect(route.points[0]).toMatchObject({ x: 10_408.6, y: -6337.8, z: 37.4 });
    expect(route.points.at(-1)).toMatchObject({ x: 10_402.9, y: -6343.5 });
  });

  test("Fargo Deep start 0.2 yd off the mesh plans to the next room", () => {
    const route = nav().plan(
      0,
      { x: -9754.3, y: 139.3, z: 20.6 },
      { x: -9746.3, y: 139.3, z: 19.58 },
    );
    expect(route.points[0]).toMatchObject({ x: -9754.3, y: 139.3, z: 20.6 });
    expect(route.points.at(-1)).toMatchObject({ x: -9746.3, y: 139.3 });
  });
});
