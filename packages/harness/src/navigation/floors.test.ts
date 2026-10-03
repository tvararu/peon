import { describe, expect, test } from "bun:test";
import type { NavPoint } from "@peon/core";
import { groundFloors } from "#harness/navigation/column";
import { refusalFloors } from "#harness/navigation/planner";
import { native, navigation } from "#test-support/navigation-fixtures";

const start: NavPoint = { x: 0, y: 0, z: 0 };
const end = { x: 10, y: 0 };

function atEnd(column: number[], routable: number[] = column) {
  let target = 0;
  return navigation(
    native({
      findHeight: (_from, x) => (x === 10 ? target : (target * x) / 10),
      findHeights: (x) => {
        if (x === 10) return column;
        return [(target * x) / 10];
      },
      findPath: (from, to) => {
        target = to.z;
        return routable.includes(to.z)
          ? [{ ...from }, { ...to }]
          : [{ ...from }, { ...to, z: to.z + 5 }];
      },
    }),
  );
}

function refusal(plan: () => unknown): Error {
  try {
    plan();
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("expected a refusal");
}

describe("ground floors at the start and destination", () => {
  test("a surface under less than agent height of headroom is not a floor", () => {
    const covered = atEnd([0, -1.59]).planGround(530, start, end);
    expect(covered.points.at(-1)).toMatchObject({ ...end, z: 0 });
    const error = refusal(() => atEnd([0, -1.61]).planGround(530, start, end));
    expect(error.message).toBe(
      "ambiguous ground column at destination (floors 0.00, -1.61)",
    );
    expect(refusalFloors(error)).toEqual([0, -1.61]);
  });
  test("surfaces within ground error are one floor", () => {
    expect(groundFloors([7.7437, 7.7585])).toEqual([7.7437]);
    const route = atEnd([7.7437, 7.7585]).planGround(530, start, end);
    expect(route.points.at(-1)).toMatchObject({ ...end, z: 7.7437 });
  });

  test("floors a step apart with headroom between stay two floors", () => {
    const error = refusal(() => atEnd([10, 8]).planGround(530, start, end));
    expect(refusalFloors(error)).toEqual([10, 8]);
  });

  test("lists only the surfaces with headroom, highest first", () => {
    const error = refusal(() => atEnd([8, 5, 4.5]).planGround(530, start, end));
    expect(refusalFloors(error)).toEqual([8, 5]);
  });

  test("an explicit Z selects one floor of a multi-floor column", () => {
    const route = atEnd([10, 0]).plan(530, start, { ...end, z: 0 });
    expect(route.points.at(-1)).toMatchObject({ ...end, z: 0 });
  });

  test("an explicit Z off every floor is refused with the floors, not replaced", () => {
    for (const z of [0.5, 5, -1]) {
      const error = refusal(() =>
        atEnd([10, 0]).plan(530, start, { ...end, z }),
      );
      expect(error.message).toBe(
        "destination is not on a ground floor (floors 10.00, 0.00)",
      );
      expect(refusalFloors(error)).toEqual([10, 0]);
    }
    const underCover = refusal(() =>
      atEnd([1, 0]).plan(530, start, { ...end, z: 0 }),
    );
    expect(refusalFloors(underCover)).toEqual([1]);
  });

  test("the start pose must stand on a floor of its column", () => {
    const column = (under: number[]) =>
      navigation(native({ findHeights: (x) => (x === 0 ? under : [0]) }));
    const route = column([10, 0]).plan(530, start, { ...end, z: 0 });
    expect(route.points[0]).toEqual(start);
    expect(() => column([1, 0]).plan(530, start, { ...end, z: 0 })).toThrow(
      "ambiguous ground column at start",
    );
    expect(() =>
      column([10, 0]).plan(530, { ...start, z: 5 }, { ...end, z: 0 }),
    ).toThrow("position disagrees with ground height");
  });
});

describe("destination floors the mesh routes", () => {
  test("the one routable floor of a multi-floor column is the destination", () => {
    const route = atEnd([10, 0], [0]).planGround(530, start, end);
    expect(route.points.at(-1)).toMatchObject({ ...end, z: 0 });
    const upper = atEnd([10, 0], [10]).planGround(530, start, end);
    expect(upper.points.at(-1)).toMatchObject({ ...end, z: 10 });
  });

  test("several routable floors stay ambiguous and list only those", () => {
    const error = refusal(() =>
      atEnd([6, 3, 0], [6, 0]).planGround(530, start, end),
    );
    expect(refusalFloors(error)).toEqual([6, 0]);
    expect(error.message).toContain("ambiguous ground column at destination");
  });

  test("no routable floor refuses", () => {
    const error = refusal(() => atEnd([10, 0], []).planGround(530, start, end));
    expect(error.message).toContain("snapped off");
  });

  test("an explicit Z is never replaced by another routable floor", () => {
    expect(() =>
      atEnd([10, 0], [10]).plan(530, start, { ...end, z: 0 }),
    ).toThrow("snapped off");
  });

  test("floorsAt lists the clear floors of a column", () => {
    expect(atEnd([10, 0, 9.9], []).floorsAt(530, 10, 0)).toEqual([10, 0]);
  });
});

describe("route refusals from a multi-floor start", () => {
  test("a drop off the start's platform before open ground names the start", () => {
    const nav = navigation(
      native({
        findHeight: (_from, x) => (x >= 4 ? -2.4 : 0),
        findHeights: (x) => (x < 8 ? [0, -2.4] : [-2.4]),
      }),
    );
    expect(() => nav.planGround(530, start, end)).toThrow(
      "ambiguous ground column leaving start",
    );
  });

  test("a refusal after the route reaches open ground stays at route", () => {
    const nav = navigation(
      native({
        findHeights: (x) => {
          if (x < 2) return [0, -5];
          return x > 5 && x < 7 ? [0, 1] : [0];
        },
      }),
    );
    expect(() => nav.planGround(530, start, end)).toThrow(
      "ambiguous ground column at route",
    );
  });
});

describe("a start pose hovering over its only floor", () => {
  const flat = () => navigation(native());
  const multi = () =>
    navigation(native({ findHeights: (x) => (x === 0 ? [10, 0] : [0]) }));

  test("plans from the floor under a pose up to one climb above it", () => {
    for (const z of [0.44, 1]) {
      const route = flat().plan(530, { ...start, z }, { ...end, z: 0 });
      expect(route.points[0]).toEqual(start);
      const ground = flat().planGround(530, { ...start, z }, end);
      expect(ground.points[0]).toEqual(start);
    }
  });

  test("keeps a pose within ground error exactly as observed", () => {
    const route = flat().plan(530, { ...start, z: 0.2 }, { ...end, z: 0 });
    expect(route.points[0]).toEqual({ ...start, z: 0.2 });
  });

  test("still refuses a pose far above, below, or over a multi-floor column", () => {
    const refused = "position disagrees with ground height";
    expect(() =>
      flat().plan(530, { ...start, z: 1.5 }, { ...end, z: 0 }),
    ).toThrow(refused);
    expect(() =>
      flat().plan(530, { ...start, z: -0.44 }, { ...end, z: 0 }),
    ).toThrow(refused);
    expect(() =>
      multi().plan(530, { ...start, z: 0.44 }, { ...end, z: 0 }),
    ).toThrow(refused);
  });
});
