import { expect, jest, test } from "bun:test";
import { must } from "@peon/core/test-support/must";
import type { NativeMap } from "#harness/navigation/native";
import { GroundRoute } from "#harness/navigation/planner";
import { routeSetup as setup } from "#test-support/navigation-fixtures";

test("ground-route movement samples mesh height and HALT prevents lease renewal", () => {
  jest.useFakeTimers();
  try {
    const { runtime, advance, sent } = setup();
    const start = must(runtime.snapshot().pose);
    const destination = { x: start.x + 21, y: start.y, z: start.z + 3 };
    const height = (x: number): number =>
      start.z +
      Math.min(2, ((x - start.x) * 2) / 7) +
      Math.max(0, x - start.x - 7) / 14;
    const ground: NativeMap = {
      close() {},
      findHeight: (_from, x) => height(x),
      findHeights: (x) => [height(x)],
      findLiquid: () => undefined,
      findPath: () => [],
      lineOfSight: () => true,
      loadAdtAt() {},
    };
    const route = new GroundRoute(
      [
        { x: start.x, y: start.y, z: start.z },
        { x: start.x + 7, y: start.y, z: start.z + 2 },
        destination,
      ],
      ground,
    );
    runtime.navigate(route, destination);
    advance(1000);
    expect(runtime.snapshot().pose?.z).toBeCloseTo(start.z + 2);
    expect(runtime.snapshot().serverPose?.z).toBe(start.z);
    runtime.halt();
    const stopped = runtime.snapshot().pose;
    const count = sent.length;
    advance(10_000);
    expect(runtime.snapshot().pose).toEqual(stopped);
    expect(runtime.navigationState().active).toBe(false);
    expect(sent.length).toBe(count);
  } finally {
    jest.useRealTimers();
  }
});

test("root stops navigation", () => {
  jest.useFakeTimers();
  try {
    const { runtime } = setup();
    const start = must(runtime.snapshot().pose);
    const destination = { x: start.x + 20, y: start.y, z: start.z };
    const ground: NativeMap = {
      close() {},
      findHeight: () => start.z,
      findHeights: () => [start.z],
      findLiquid: () => undefined,
      findPath: () => [],
      lineOfSight: () => true,
      loadAdtAt() {},
    };
    runtime.navigate(
      new GroundRoute([start, destination], ground),
      destination,
    );
    runtime.forceRoot(1);
    expect(runtime.navigationState().active).toBe(false);
    expect(runtime.navigationState().blockedReason).toBe("root");
  } finally {
    jest.useRealTimers();
  }
});

test("an old-origin route cannot reset a moving predicted pose", () => {
  jest.useFakeTimers();
  try {
    const { runtime, advance } = setup();
    const start = must(runtime.snapshot().pose);
    const destination = { x: start.x + 20, y: start.y, z: start.z };
    const ground: NativeMap = {
      close() {},
      findHeight: () => start.z,
      findHeights: () => [start.z],
      findLiquid: () => undefined,
      findPath: () => [],
      lineOfSight: () => true,
      loadAdtAt() {},
    };
    const route = new GroundRoute([start, destination], ground);
    runtime.navigate(route, destination);
    advance(300);
    const moving = must(runtime.snapshot().pose);
    expect(() => runtime.navigate(route, destination)).toThrow(/origin/);
    expect(must(runtime.snapshot().pose).x).toBeCloseTo(moving.x);
    expect(runtime.snapshot().moving).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});

test("navigationError stores refusal and navigate clears refusal", () => {
  const { runtime } = setup();
  const dest = { x: 8730, y: -6600, z: 70 };
  runtime.navigationError(dest, "position disagrees with ground height");
  expect(runtime.navigationState()).toEqual({
    active: false,
    blockedReason: "position disagrees with ground height",
    destination: dest,
    refusal: "wait",
    remaining: undefined,
  });

  runtime.navigationError(dest, "ambiguous ground column at destination");
  expect(runtime.navigationState().refusal).toBe("pick_destination");

  runtime.navigationError(dest, "pathfind_find_height failed (UNKNOWN_HEIGHT)");
  expect(runtime.navigationState().refusal).toBe("stop");

  const start = must(runtime.snapshot().pose);
  const destMatching = { ...dest, z: start.z };
  const ground: NativeMap = {
    close() {},
    findHeight: () => start.z,
    findHeights: () => [start.z],
    findLiquid: () => undefined,
    findPath: () => [],
    lineOfSight: () => true,
    loadAdtAt() {},
  };
  runtime.navigate(
    new GroundRoute([start, destMatching], ground),
    destMatching,
  );
  expect(runtime.navigationState().refusal).toBeUndefined();
  expect(runtime.navigationState().blockedReason).toBeUndefined();
});

test("a route may start on the floor just under the pose, nowhere else", () => {
  const { runtime } = setup();
  const pose = must(runtime.snapshot().pose);
  const routeFrom = (origin: { x: number; y: number; z: number }) => {
    const ground: NativeMap = {
      close() {},
      findHeight: () => origin.z,
      findHeights: () => [origin.z],
      findLiquid: () => undefined,
      findPath: () => [],
      lineOfSight: () => true,
      loadAdtAt() {},
    };
    const destination = { ...origin, x: origin.x + 10 };
    return [
      new GroundRoute([origin, destination], ground),
      destination,
    ] as const;
  };
  const floor = { x: pose.x, y: pose.y, z: pose.z - 0.44 };
  expect(() => runtime.navigate(...routeFrom(floor))).not.toThrow();
  runtime.halt();
  const moved = must(runtime.snapshot().pose);
  for (const origin of [
    { x: moved.x, y: moved.y, z: moved.z - 1.5 },
    { x: moved.x, y: moved.y, z: moved.z + 0.44 },
    { x: moved.x + 0.5, y: moved.y, z: moved.z - 0.44 },
  ])
    expect(() => runtime.navigate(...routeFrom(origin))).toThrow(
      "navigation_origin_changed",
    );
});
