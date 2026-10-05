import { describe, expect, test } from "bun:test";
import type { NearbyRow } from "@peon/core";
import { poseOf } from "#harness/loops/pilot-geometry";
import {
  aggroRadiusYd,
  buildPilotUnits,
  dangerAlong,
  rayEntryYd,
  unitLine,
} from "#harness/loops/pilot-units";
import { MAP_ID, unitRow } from "#test-support/ops-fixtures";

const SELF = 1n;

function selfRow(level = 10): NearbyRow {
  return {
    ...unitRow({ distance: 0, guid: SELF, level, name: "Self", x: 0, y: 0 }),
    self: true,
  };
}

function mob(
  guid: bigint,
  x: number,
  y: number,
  over: Partial<Parameters<typeof unitRow>[0]> = {},
): NearbyRow {
  return unitRow({
    distance: Math.hypot(x, y),
    guid,
    level: 2,
    name: "Kobold Vermin",
    x,
    y,
    ...over,
  });
}

function pose() {
  return poseOf({ mapId: MAP_ID, orientation: 0, x: 0, y: 0, z: 0 }, 7, false);
}

describe("aggro radius", () => {
  test("same level infers 20 yd", () => {
    expect(aggroRadiusYd(10, 10)).toBe(20);
  });

  test("lower-level mob narrows the range", () => {
    expect(aggroRadiusYd(10, 2)).toBe(12);
  });

  test("higher-level mob widens the range", () => {
    expect(aggroRadiusYd(10, 15)).toBe(25);
  });

  test("clamps at 5 yd for far lower mobs", () => {
    expect(aggroRadiusYd(30, 10)).toBe(5);
  });

  test("clamps at 45 yd for far higher mobs", () => {
    expect(aggroRadiusYd(1, 30)).toBe(45);
    expect(aggroRadiusYd(10, 40)).toBe(45);
  });
});

describe("ray entry", () => {
  test("head-on ray reports the near edge", () => {
    expect(
      rayEntryYd({ x: 0, y: 0 }, 0, { name: "mob", radiusYd: 5, x: 12, y: 0 }),
    ).toBeCloseTo(7, 9);
  });

  test("a ray missing the circle reports nothing", () => {
    expect(
      rayEntryYd({ x: 0, y: 0 }, 0, { name: "mob", radiusYd: 5, x: 12, y: 20 }),
    ).toBeUndefined();
  });

  test("a ray starting inside reports zero when moving deeper", () => {
    expect(
      rayEntryYd({ x: 11, y: 0 }, 0, { name: "mob", radiusYd: 5, x: 12, y: 0 }),
    ).toBe(0);
  });

  test("a ray starting inside reports nothing when leaving", () => {
    expect(
      rayEntryYd({ x: 11, y: 0 }, Math.PI, {
        name: "mob",
        radiusYd: 5,
        x: 12,
        y: 0,
      }),
    ).toBeUndefined();
  });
});

describe("pilot units", () => {
  test("orders by margin and keeps hostile living creatures", () => {
    const rows = [
      selfRow(),
      mob(2n, 31, 0),
      mob(3n, 10, 0, { level: 10 }),
      mob(4n, 50, 0, { relation: "friendly" }),
      mob(5n, 8, 0, { hp: 0 }),
    ];
    const units = buildPilotUnits(rows, pose());
    expect(units.map((unit) => unit.name)).toEqual([
      "Kobold Vermin",
      "Kobold Vermin",
    ]);
    expect(units[0]?.marginYd).toBeLessThan(units[1]?.marginYd ?? 0);
  });

  test("caps the list at five units", () => {
    const rows = [
      selfRow(),
      ...Array.from({ length: 7 }, (_, index) =>
        mob(BigInt(index + 2), 20 + index, 0),
      ),
    ];
    expect(buildPilotUnits(rows, pose())).toHaveLength(5);
  });

  test("ignores creatures beyond 60 yd", () => {
    const rows = [selfRow(), mob(2n, 61, 0)];
    expect(buildPilotUnits(rows, pose())).toHaveLength(0);
  });
});

describe("danger masking", () => {
  test("a heading into a range is masked, a clear heading stays", () => {
    const rows = [selfRow(), mob(2n, 12, 0)];
    const units = buildPilotUnits(rows, pose());
    const circles = units.flatMap((unit) =>
      unit.radiusYd === undefined
        ? []
        : [
            {
              name: unit.name,
              radiusYd: unit.radiusYd + 1,
              x: unit.x,
              y: unit.y,
            },
          ],
    );
    expect(dangerAlong({ x: 0, y: 0 }, 0, circles, 10)?.yd).toBeLessThan(2);
    expect(dangerAlong({ x: 0, y: 0 }, Math.PI, circles, 10)).toBeUndefined();
  });

  test("moving away while inside is not danger", () => {
    const rows = [selfRow(), mob(2n, 10, 0)];
    const units = buildPilotUnits(rows, pose());
    const [unit] = units;
    expect(unit?.marginYd).toBeLessThan(0);
    expect(
      rayEntryYd({ x: 0, y: 0 }, Math.PI, {
        name: "mob",
        radiusYd: (unit?.radiusYd ?? 0) + 1,
        x: 10,
        y: 0,
      }),
    ).toBeUndefined();
  });
});

describe("unit line", () => {
  test("keeps observed and inferred facts apart", () => {
    const rows = [
      selfRow(),
      { ...mob(2n, 31, 0), attackingMe: false, remotePose: undefined },
    ];
    const [unit] = buildPilotUnits(rows, pose());
    expect(unit).toBeDefined();
    if (!unit) return;
    const line = unitLine({ ...unit, state: "standing still" }, pose());
    expect(line).toContain("Kobold Vermin, level 2");
    expect(line).toContain("(observed)");
    expect(line).toContain("Inferred aggro range");
  });
});
