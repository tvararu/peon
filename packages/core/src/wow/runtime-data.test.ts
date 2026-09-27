import { describe, expect, jest, test } from "bun:test";
import { dbcFiles, packDbc } from "#test-support/dbc";
import type { NavigationSource } from "#wow/navigation-native";
import { catalogAccess } from "#wow/runtime";
import {
  capabilitiesOf,
  type LazyState,
  warmCatalogs,
} from "#wow/runtime-data";

const expansionOnly: NavigationSource = {
  covers: (mapId) => mapId === 530,
  open: () => {
    throw new Error("unused");
  },
};

const EMPTY_DBCS: [file: string, fields: number][] = [
  ["FactionTemplate.dbc", 14],
  ["Spell.dbc", 234],
  ["SpellRange.dbc", 40],
  ["SpellCastTimes.dbc", 4],
  ["SpellDuration.dbc", 4],
  ["SpellRadius.dbc", 4],
];
function emptyDbcs(files: [file: string, fields: number][]) {
  return dbcFiles(
    new Map(files.map(([file, fields]) => [file, packDbc(fields, [])])),
  );
}

describe("capabilitiesOf", () => {
  test("reports nothing when no data is configured or loaded", () => {
    expect(capabilitiesOf({}, { disposed: false })).toEqual({
      factions: false,
      spells: false,
      navigation: false,
    });
  });

  test("navigation needs a source", () => {
    const lazy: LazyState = { disposed: false };
    expect(capabilitiesOf({ navigation: expansionOnly }, lazy)).toMatchObject({
      navigation: true,
    });
  });

  test("navigation on the current map needs the source to cover it", () => {
    const lazy: LazyState = { disposed: false };
    const config = { navigation: expansionOnly };
    expect(capabilitiesOf(config, lazy, 530).navigation).toBe(true);
    expect(capabilitiesOf(config, lazy, 0).navigation).toBe(false);
    expect(capabilitiesOf({}, lazy, 530).navigation).toBe(false);
  });

  test("runtime capabilities follow the current pose's map", () => {
    let mapId: number | undefined = 530;
    const control = {
      snapshot: () => ({ pose: mapId === undefined ? undefined : { mapId } }),
    } as unknown as Parameters<typeof catalogAccess>[3];
    const access = catalogAccess(
      { navigation: expansionOnly } as Parameters<typeof catalogAccess>[0],
      { disposed: false },
      {} as Parameters<typeof catalogAccess>[2],
      control,
    );
    expect(access.capabilities().navigation).toBe(true);
    mapId = 0;
    expect(access.capabilities().navigation).toBe(false);
    mapId = undefined;
    expect(access.capabilities().navigation).toBe(true);
  });
});

describe("warmCatalogs", () => {
  test("does nothing without a spell data source", () => {
    const lazy: LazyState = { disposed: false };
    warmCatalogs({}, lazy, { setCatalog: jest.fn() });
    expect(lazy.catalogPromise).toBeUndefined();
    expect(lazy.factionPromise).toBeUndefined();
  });

  test("loads both catalogs at once and marks each one loaded", async () => {
    const lazy: LazyState = { disposed: false };
    const combat = { setCatalog: jest.fn() };
    warmCatalogs({ dbc: emptyDbcs(EMPTY_DBCS) }, lazy, combat);
    await Promise.all([lazy.catalogPromise, lazy.factionPromise]);
    expect(capabilitiesOf({}, lazy)).toMatchObject({
      factions: true,
      spells: true,
    });
    expect(combat.setCatalog).toHaveBeenCalledTimes(1);
  });

  test("a missing spell file leaves spells unloaded and factions loaded", async () => {
    const lazy: LazyState = { disposed: false };
    const combat = { setCatalog: jest.fn() };
    const dbc = emptyDbcs([["FactionTemplate.dbc", 14]]);
    warmCatalogs({ dbc }, lazy, combat);
    await lazy.factionPromise;
    await expect(lazy.catalogPromise).rejects.toThrow(/Spell\.dbc/);
    expect(capabilitiesOf({}, lazy)).toMatchObject({
      factions: true,
      spells: false,
    });
  });
});
