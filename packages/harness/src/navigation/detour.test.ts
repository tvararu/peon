import { describe, expect, test } from "bun:test";
import type { NavPoint } from "@peon/core";
import { native, navigation } from "#test-support/navigation-fixtures";

const start: NavPoint = { x: 0, y: 0, z: 0 };
const end: NavPoint = { x: 10, y: 0, z: 0 };

const inPit = (x: number, y: number) =>
  x >= 4.5 && x <= 5.5 && y >= -3 && y <= 3;

describe("routes around ground the mesh corridor crosses", () => {
  test("plans through a waypoint when the straight corridor crosses an ambiguous pit", () => {
    const map = native({
      findHeights: (x, y) => (inPit(x, y) ? [0, 1.5] : [0]),
    });
    const route = navigation(map).plan(530, start, end);
    expect(route.points.some((point) => inPit(point.x, point.y))).toBe(false);
    expect(route.length).toBeGreaterThan(10);
    expect(route.sample(route.length)).toMatchObject(end);
  });

  test("keeps the refusal when no waypoint within reach avoids the pit", () => {
    const map = native({
      findHeights: (x) => (x >= 4.5 && x <= 5.5 ? [0, 1.5] : [0]),
    });
    expect(() => navigation(map).plan(530, start, end)).toThrow(/ambiguous/);
  });

  test("checks the way back with the floor the walker stands on when leaving a multi-floor start", () => {
    const map = native({
      findHeight: (from, x) => (x < from.x ? -3 : 0),
      findHeights: () => [0, -3],
    });
    const route = navigation(map).plan(530, start, end);
    expect(route.sample(route.length)).toMatchObject(end);
  });
});
