import { describe, expect, test } from "bun:test";
import type { AreaTrigger } from "#wow/areas/objects/trigger-catalog";
import { insideTrigger, TriggerWatch } from "#wow/areas/objects/trigger-watch";

const FARGODEEP: AreaTrigger = {
  id: 88,
  map: 0,
  x: -9843.54,
  y: 127.525,
  z: 5.37,
  radius: 10,
  length: 0,
  width: 0,
  height: 0,
  orientation: 0,
};
const BOX: AreaTrigger = {
  id: 101,
  map: 0,
  x: 0,
  y: 0,
  z: 0,
  radius: 0,
  length: 4,
  width: 10,
  height: 8,
  orientation: Math.PI / 2,
};
const DEADMINES: AreaTrigger = { ...FARGODEEP, id: 78, map: 36 };

const at = (mapId: number, x: number, y: number, z: number) => ({
  mapId,
  x,
  y,
  z,
});
const INSIDE = at(0, -9843.54, 120.525, 5.37);
const OUTSIDE = at(0, -9843.54, 110, 5.37);
const WALKING = { taxi: false };

function watch() {
  const byMap = new Map<number, AreaTrigger[]>([
    [0, [FARGODEEP, BOX]],
    [36, [DEADMINES]],
  ]);
  return new TriggerWatch((map) => byMap.get(map) ?? []);
}

describe("insideTrigger (Player.cpp:2218-2238)", () => {
  test("a trigger with a radius is a sphere", () => {
    expect(insideTrigger(FARGODEEP, INSIDE)).toBe(true);
    expect(insideTrigger(FARGODEEP, at(0, -9843.54, 137.5, 5.37))).toBe(true);
    expect(insideTrigger(FARGODEEP, at(0, -9843.54, 137.6, 5.37))).toBe(false);
    expect(insideTrigger(FARGODEEP, at(0, -9843.54, 127.525, 15.5))).toBe(
      false,
    );
  });

  test("a trigger with no radius is a box turned by its orientation", () => {
    expect(insideTrigger(BOX, at(0, 4.5, 0, 0))).toBe(true);
    expect(insideTrigger(BOX, at(0, 0, 1.9, 0))).toBe(true);
    expect(insideTrigger(BOX, at(0, 0, 2.1, 0))).toBe(false);
    expect(insideTrigger(BOX, at(0, 5.1, 0, 0))).toBe(false);
    expect(insideTrigger(BOX, at(0, 0, 0, 4.1))).toBe(false);
  });

  test("a trigger on another map never holds the point", () => {
    expect(insideTrigger(DEADMINES, INSIDE)).toBe(false);
  });
});

describe("TriggerWatch", () => {
  test("entering trigger 88 sends it once and staying inside sends nothing", () => {
    const w = watch();
    expect(w.move(OUTSIDE, WALKING)).toEqual([]);
    expect(w.move(INSIDE, WALKING)).toEqual([88]);
    expect(w.move(at(0, -9843.54, 125, 5.37), WALKING)).toEqual([]);
    expect(w.inside()).toEqual([88]);
  });

  test("leaving and entering again sends again", () => {
    const w = watch();
    w.move(INSIDE, WALKING);
    expect(w.move(OUTSIDE, WALKING)).toEqual([]);
    expect(w.inside()).toEqual([]);
    expect(w.move(INSIDE, WALKING)).toEqual([88]);
  });

  test("a map change clears inside", () => {
    const w = watch();
    w.move(INSIDE, WALKING);
    expect(w.move(at(36, 0, 0, 0), WALKING)).toEqual([]);
    expect(w.inside()).toEqual([]);
    expect(w.move(INSIDE, WALKING)).toEqual([88]);
  });

  test("an arrival marks the triggers at the arrival point inside without a send", () => {
    const w = watch();
    w.move(OUTSIDE, WALKING);
    w.arrive(at(36, -9843.54, 127.525, 5.37));
    expect(w.inside()).toEqual([78]);
    expect(w.move(at(36, -9843.54, 125, 5.37), WALKING)).toEqual([]);
    w.arrive(INSIDE);
    expect(w.inside()).toEqual([88]);
    expect(w.move(INSIDE, WALKING)).toEqual([]);
  });

  test("no send while the character is on a taxi (MiscHandler.cpp:699-704)", () => {
    const w = watch();
    w.move(OUTSIDE, WALKING);
    expect(w.move(INSIDE, { taxi: true })).toEqual([]);
    expect(w.move(INSIDE, WALKING)).toEqual([]);
    w.move(OUTSIDE, WALKING);
    expect(w.move(INSIDE, WALKING)).toEqual([88]);
  });
});
