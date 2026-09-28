import { describe, expect, test } from "bun:test";
import { objectsAreaTriggerDbc } from "#test-support/areas/objects";
import { dbcFiles, packDbc } from "#test-support/dbc";
import {
  type AreaTrigger,
  loadAreaTriggers,
} from "#wow/areas/objects/trigger-catalog";

const FARGODEEP: AreaTrigger = {
  id: 88,
  map: 0,
  x: Math.fround(-9843.54),
  y: Math.fround(127.525),
  z: Math.fround(5.3698),
  radius: 10,
  length: 0,
  width: 0,
  height: 0,
  orientation: 0,
};
const STORMWIND_BOX: AreaTrigger = {
  id: 101,
  map: 0,
  x: Math.fround(-8761.85),
  y: Math.fround(848.557),
  z: Math.fround(87.8052),
  radius: 0,
  length: Math.fround(4.972),
  width: Math.fround(9.694),
  height: Math.fround(7.444),
  orientation: Math.fround(0.6632),
};
const RAZORFEN: AreaTrigger = { ...FARGODEEP, id: 95, map: 30 };

function source(triggers: readonly AreaTrigger[]) {
  return dbcFiles(
    new Map([["AreaTrigger.dbc", objectsAreaTriggerDbc(triggers)]]),
  );
}

describe("AreaTriggerCatalog", () => {
  test("reads the ten AreaTrigger.dbc fields in the order of the areatrigger table (ObjectMgr.cpp:7251)", async () => {
    const catalog = await loadAreaTriggers(source([FARGODEEP, STORMWIND_BOX]));
    expect(catalog.get(88)).toEqual(FARGODEEP);
    expect(catalog.get(101)).toEqual(STORMWIND_BOX);
    expect(catalog.get(7)).toBeUndefined();
  });

  test("indexes triggers by map", async () => {
    const catalog = await loadAreaTriggers(
      source([FARGODEEP, RAZORFEN, STORMWIND_BOX]),
    );
    expect(catalog.onMap(0).map((t) => t.id)).toEqual([88, 101]);
    expect(catalog.onMap(30).map((t) => t.id)).toEqual([95]);
    expect(catalog.onMap(1)).toEqual([]);
  });

  test("fails when AreaTrigger.dbc is missing", async () => {
    await expect(loadAreaTriggers(dbcFiles(new Map()))).rejects.toThrow(
      /AreaTrigger\.dbc/,
    );
  });

  test("fails on a layout that is not ten fields", async () => {
    const wrong = dbcFiles(new Map([["AreaTrigger.dbc", packDbc(9, [[88]])]]));
    await expect(loadAreaTriggers(wrong)).rejects.toThrow(/unsupported layout/);
  });
});
