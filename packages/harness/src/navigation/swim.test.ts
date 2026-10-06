import { describe, expect, test } from "bun:test";
import type { NavPoint } from "@peon/core";
import { native, navigation } from "#test-support/navigation-fixtures";

const BED = -3;
const SURFACE = -0.2;
const from: NavPoint = { x: 0, y: 0, z: 0 };
const to: NavPoint = { x: 20, y: 0, z: 0 };

const inRiver = (x: number) => x >= 6 && x < 14;

function river(over: Parameters<typeof native>[0] = {}) {
  return native({
    findHeight: (_from, x) => (inRiver(x) ? BED : 0),
    findHeights: (x) => [inRiver(x) ? BED : 0],
    findLiquid: (point) => (inRiver(point.x) ? SURFACE : undefined),
    ...over,
  });
}

describe("routes through water", () => {
  test("follows the surface across a river and marks only the wet stretch", () => {
    const route = navigation(river()).plan(530, from, to);
    const wet = (x: number) => route.sample(x);
    expect(wet(3).swimming).toBe(false);
    expect(wet(3).z).toBeCloseTo(0);
    expect(wet(10).swimming).toBe(true);
    expect(wet(10).z).toBeCloseTo(SURFACE);
    expect(wet(17).swimming).toBe(false);
    expect(wet(17).z).toBeCloseTo(0);
  });

  test("walks the bed when the river holds no liquid", () => {
    const dry = river({ findLiquid: () => undefined });
    const route = navigation(dry).plan(530, from, to);
    expect(route.sample(10).swimming).toBe(false);
    expect(route.sample(10).z).toBeCloseTo(BED);
  });

  test("refuses a bank higher than a step above the water", () => {
    const bed = (x: number) => {
      if (x >= 14) return 5;
      return inRiver(x) ? BED : 0;
    };
    const cliff = river({
      findHeight: (_from, x) => bed(x),
      findHeights: (x) => [bed(x)],
    });
    expect(() => navigation(cliff).plan(530, from, { ...to, z: 5 })).toThrow(
      /ground|water|shore/,
    );
  });

  test("plans from a start that is already in the water", () => {
    const swimming = { x: 8, y: 0, z: SURFACE };
    const route = navigation(river()).plan(530, swimming, to);
    expect(route.sample(0).swimming).toBe(true);
    expect(route.sample(route.length).swimming).toBe(false);
  });
});
