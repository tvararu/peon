import { describe, expect, test } from "bun:test";
import type { NavPoint } from "@peon/core";
import { native, navigation } from "#test-support/navigation-fixtures";

const riser = 4;

type Step = { low: number; column: number[]; pick: number; high: number };

function part<T>(x: number, before: T, over: T, after: T): T {
  if (x < riser) return before;
  return x < 6 ? over : after;
}

function stepped({ low, column, pick, high }: Step, blocked = false) {
  return native({
    findHeight: (_from, x) => part(x, low, pick, high),
    findHeights: (x) => part(x, [low], column, [high]),
    lineOfSight: (a, b) =>
      !(
        blocked &&
        Math.min(a.x, b.x) < riser &&
        Math.max(a.x, b.x) >= riser &&
        Math.min(a.z, b.z) < pick
      ),
  });
}

function route(step: Step, blocked = false) {
  const start: NavPoint = { x: 0, y: 0, z: step.low };
  return navigation(stepped(step, blocked)).plan(530, start, {
    x: 10,
    y: 0,
    z: step.high,
  });
}

describe("a stair riser just past the walkable climb", () => {
  const northshire = {
    column: [81.77, 80.7],
    high: 81.77,
    low: 80.71,
    pick: 81.77,
  };

  test("climbs onto the only floor of a column over a covered surface", () => {
    const planned = route(northshire);
    expect(planned.points.at(-1)).toMatchObject({ x: 10, z: 81.77 });
    expect(planned.sample(5).z).toBe(81.77);
  });

  test("climbs a riser the low ray cannot clear within the mesh step", () => {
    const planned = route(northshire, true);
    expect(planned.points.at(-1)).toMatchObject({ x: 10, z: 81.77 });
  });

  test("keeps the floor of the previous sample over a far lower floor", () => {
    const planned = route({
      column: [83.5, 70.1],
      high: 83.5,
      low: 83.3,
      pick: 70.1,
    });
    expect(planned.sample(5).z).toBe(83.5);
  });

  test("refuses a pick onto a surface with no headroom", () => {
    const step = { column: [83.9, 83.5], high: 83.5, low: 83.7, pick: 83.5 };
    expect(() => route(step)).toThrow("ambiguous ground column at route");
  });

  test("refuses a rise past the climb in a column with two floors", () => {
    const step = { column: [83.8, 81.5], high: 83.8, low: 82.65, pick: 83.8 };
    expect(() => route(step)).toThrow("ambiguous ground column at route");
  });

  test("refuses a riser taller than the mesh step", () => {
    const step = { column: [81.77, 80.4], high: 81.77, low: 80.4, pick: 81.77 };
    expect(() => route(step, true)).toThrow("ambiguous ground column at route");
  });
});
