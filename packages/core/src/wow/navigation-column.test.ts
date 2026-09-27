import { describe, expect, test } from "bun:test";
import { native, navigation } from "#test-support/navigation-fixtures";
import type { NavPoint } from "#wow/navigation";

const floor = 44.6;
const start: NavPoint = { x: 0, y: 0, z: floor };
const end: NavPoint = { x: 10, y: 0, z: floor };

function middle(x: number): boolean {
  return x >= 4 && x < 6;
}

function stacked(column: number[], wrong: number) {
  return native({
    findHeight: (_from, x) => (middle(x) ? wrong : floor),
    findHeights: (x) => (middle(x) ? column : [floor]),
  });
}

describe("route columns with more than one floor", () => {
  test("keeps the floor of the previous corner in a three-floor column", () => {
    const map = stacked([51.4, 44.6, 31.1], 31.1);
    const route = navigation(map).plan(530, start, end);
    expect(route.points.every((point) => point.z === floor)).toBe(true);
    expect(route.sample(5).z).toBe(floor);
  });

  test("still refuses when two floors are within a step of the previous corner", () => {
    const map = stacked([45.5, 43.7, 31.1], 31.1);
    expect(() => navigation(map).plan(530, start, end)).toThrow(
      "ambiguous ground column at route",
    );
  });

  test("still refuses when no floor continues the previous corner", () => {
    const map = stacked([51.4, 31.1], 31.1);
    expect(() => navigation(map).plan(530, start, end)).toThrow(
      "ambiguous ground column at route",
    );
  });

  test("keeps the native floor when it is a walkable step", () => {
    const map = stacked([45.3, 31.1], 45.3);
    const route = navigation(map).plan(530, start, end);
    expect(route.sample(5).z).toBe(45.3);
  });
});
