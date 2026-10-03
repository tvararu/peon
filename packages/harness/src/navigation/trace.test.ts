import { describe, expect, test } from "bun:test";
import type { NavPoint } from "@peon/core";
import { groundError } from "#harness/navigation/native";
import { native, navigation } from "#test-support/navigation-fixtures";

const start: NavPoint = { x: 0, y: 0, z: 0 };
const end: NavPoint = { x: 10, y: 0, z: 0 };

describe("lost height traces", () => {
  test("falls back to the known column when only the return trace loses ground", () => {
    const map = native({
      findHeight: (from, x) => {
        if (x < from.x)
          throw groundError("pathfind_find_height failed (UNKNOWN_HEIGHT)");
        return 0;
      },
    });
    const route = navigation(map).planGround(530, start, { x: 10, y: 0 });
    expect(route.points.at(-1)).toMatchObject(end);
  });

  test("keeps the ground refusal when the return trace fails across a step", () => {
    const map = native({
      findHeight: (from, x) => {
        if (x < from.x)
          throw groundError("pathfind_find_height failed (UNKNOWN_HEIGHT)");
        return x >= 5 ? 2 : 0;
      },
      findHeights: (x) => [x >= 5 ? 2 : 0],
    });
    expect(() => navigation(map).plan(530, start, { ...end, z: 2 })).toThrow(
      /UNKNOWN_HEIGHT/,
    );
  });

  test("crosses a lost height trace on the one walkable floor of the column", () => {
    const map = native({
      findHeight: (from, x) => {
        if (from.x < 5 && x >= 5) throw groundError("UNKNOWN_HEIGHT");
        return 0;
      },
    });
    expect(navigation(map).plan(530, start, end).length).toBeCloseTo(10);
  });

  test("reaches a unit whose own point loses the height trace", () => {
    const map = native({
      findHeight: (_from, x) => {
        if (x >= 9.5) throw groundError("UNKNOWN_HEIGHT");
        return 0;
      },
    });
    const route = navigation(map).planGround(530, start, { x: 10, y: 0 });
    expect(route.points.at(-1)).toMatchObject(end);
  });

  test("walks the terrain line when the lost trace sits under a raised mesh corner", () => {
    const map = native({
      findHeight: (from, x) => {
        if (from.x < 5 && x >= 5) throw groundError("UNKNOWN_HEIGHT");
        return 0;
      },
      findPath: (from, to) => [from, { x: 5, y: 1, z: 3 }, to],
    });
    expect(navigation(map).plan(530, start, end).length).toBeCloseTo(10);
  });

  test("keeps a lost height trace refused over two walkable floors", () => {
    const map = native({
      findHeight: (from, x) => {
        if (from.x < 5 && x >= 5) throw groundError("UNKNOWN_HEIGHT");
        return 0;
      },
      findHeights: (x) => (x >= 5 && x < 6 ? [0, 0.4] : [0]),
    });
    expect(() => navigation(map).plan(530, start, end)).toThrow(
      /UNKNOWN_HEIGHT/,
    );
  });

  test("falls back to the standable floor nearest the walker", () => {
    const map = native({
      findHeight: (from, x) => {
        if (from.x < 5 && x >= 5) throw groundError("UNKNOWN_HEIGHT");
        return 14.06;
      },
      findHeights: (x) => (x >= 5 && x < 6 ? [13.85, 13.73, 14.06] : [14.06]),
    });
    const pose = { x: 0, y: 0, z: 14.06 };
    const route = navigation(map).plan(530, pose, { x: 10, y: 0, z: 14.06 });
    expect(route.points.at(-1)).toMatchObject({ x: 10, y: 0, z: 14.06 });
  });

  test("keeps the fallback refused over two clear floors in reach", () => {
    const map = native({
      findHeight: (from, x) => {
        if (from.x < 5 && x >= 5) throw groundError("UNKNOWN_HEIGHT");
        return 0;
      },
      findHeights: (x) => (x >= 5 && x < 6 ? [0, 0.6] : [0]),
    });
    expect(() => navigation(map).plan(530, start, end)).toThrow(
      /UNKNOWN_HEIGHT/,
    );
  });
});
