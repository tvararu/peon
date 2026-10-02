import { describe, expect, test } from "bun:test";
import type { NavPoint } from "@peon/core";
import { groundError, type NativeMap } from "#harness/navigation/native";
import { native, navigation } from "#test-support/navigation-fixtures";

const UNKNOWN = "pathfind_find_height failed (UNKNOWN_HEIGHT)";

function ledge(options: { upper: number[]; lower: number; drop: number }) {
  const floor = (x: number) => (x >= 5 ? options.lower : options.drop);
  return native({
    findHeight: (from, x) => {
      if (from.x < 5 !== x < 5) throw groundError(UNKNOWN);
      return floor(x);
    },
    findHeights: (x) => (x >= 5 ? [options.lower] : options.upper),
  });
}

describe("a tunnel floor under a multi-floor column", () => {
  const start: NavPoint = { x: 0, y: 0, z: 2 };
  const end = { x: 10, y: 0, z: 0.9 };

  test("walks down the corridor floor when the height trace is lost inside the column", () => {
    const map = ledge({ drop: 2, lower: 0.9, upper: [2, -30] });
    const route = navigation(map).plan(530, start, end);
    expect(route.points.at(-1)).toMatchObject(end);
  });

  test("keeps the lost-height refusal over a real gap in the column", () => {
    const map = native({
      findHeight: () => {
        throw groundError(UNKNOWN);
      },
      findHeights: () => [],
    });
    expect(() => navigation(map).plan(530, start, end)).toThrow(
      /ground height unavailable/,
    );
  });

  test("keeps the refusal for a drop beyond a safe fall", () => {
    const map = ledge({ drop: 2, lower: -30, upper: [2, -60] });
    expect(() => navigation(map).plan(530, start, { ...end, z: -30 })).toThrow(
      /UNKNOWN_HEIGHT/,
    );
  });

  test("keeps the refusal for a wall that rises past the slope", () => {
    const map = ledge({ drop: 2, lower: 6, upper: [2, -30] });
    expect(() => navigation(map).plan(530, start, { ...end, z: 6 })).toThrow(
      /UNKNOWN_HEIGHT/,
    );
  });
});

describe("a tunnel corridor whose mesh corners float above the ground", () => {
  const start: NavPoint = { x: 0, y: 0, z: 0 };
  const end = { x: 10, y: 0, z: 0 };
  const corridor = (corner: NavPoint, over: Partial<NativeMap> = {}) =>
    native({
      findHeight: (from, x) => {
        if (from.x < 5 && x >= 5) throw groundError(UNKNOWN);
        return 0;
      },
      findPath: (from, to) => [from, corner, to],
      lineOfSight: (a, b) => a.x === b.x || a.y !== 0 || b.y !== 0,
      ...over,
    });

  test("walks the ground when no straight line is clear", () => {
    const route = navigation(corridor({ x: 5, y: 1, z: 7 })).plan(
      530,
      start,
      end,
    );
    expect(route.points.at(-1)).toMatchObject(end);
    expect(route.length).toBeGreaterThan(10);
  });
});

describe("a lost height trace ahead of two close floors", () => {
  const start: NavPoint = { x: 0, y: 0, z: 1.7 };
  const end = { x: 10, y: 0, z: 1.6 };
  const walk = (pair: number[]) =>
    native({
      findHeight: (from, x) => {
        if (from.x < 5 !== x < 5) throw groundError(UNKNOWN);
        return x >= 5 ? 1.6 : 1.7;
      },
      findHeights: (x) => {
        if (x < 5) return [1.7];
        return x < 8 ? pair : [1.6];
      },
    });

  test("follows the corridor floor when the column holds a twin floor within a ground error", () => {
    const route = navigation(walk([1.65, 1.85])).plan(530, start, end);
    expect(route.points.at(-1)).toMatchObject(end);
  });

  test("refuses when two floors are equally near the corridor", () => {
    expect(() => navigation(walk([1.45, 1.95])).plan(530, start, end)).toThrow(
      /UNKNOWN_HEIGHT/,
    );
  });
});

describe("a destination Z on a lower floor of a column", () => {
  const start: NavPoint = { x: 0, y: 0, z: 0 };
  const column = [10, 0];
  const map = () =>
    native({
      findHeight: (_from, x) => (x >= 10 ? 0 : 0),
      findHeights: (x) => (x >= 10 ? column : [0]),
    });

  test("snaps to the floor nearest the Z within one climb", () => {
    const route = navigation(map()).plan(530, start, { x: 10, y: 0, z: 0.6 });
    expect(route.points.at(-1)).toMatchObject({ x: 10, y: 0, z: 0 });
  });

  test("refuses a Z farther than one climb from every floor", () => {
    expect(() =>
      navigation(map()).plan(530, start, { x: 10, y: 0, z: 5 }),
    ).toThrow(/destination is not on a ground floor/);
  });

  test("refuses a Z that is within a climb of two floors", () => {
    const close = native({
      findHeight: (_from, x) => (x >= 10 ? 2.4 : 2.5),
      findHeights: (x) => (x >= 10 ? [2.5, 1.5] : [2.5]),
    });
    expect(() =>
      navigation(close).plan(
        530,
        { x: 0, y: 0, z: 2.5 },
        { x: 10, y: 0, z: 2 },
      ),
    ).toThrow(/ground/);
  });
});
