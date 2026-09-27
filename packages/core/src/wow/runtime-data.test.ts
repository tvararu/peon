import { describe, expect, jest, test } from "bun:test";
import { dbcFiles, packDbc } from "#test-support/dbc";
import {
  capabilitiesOf,
  type LazyState,
  warmCatalogs,
} from "#wow/runtime-data";

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
  test("reports nothing when no data is loaded", () => {
    expect(capabilitiesOf({ disposed: false })).toEqual({
      factions: false,
      spells: false,
    });
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
    expect(capabilitiesOf(lazy)).toMatchObject({
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
    expect(capabilitiesOf(lazy)).toMatchObject({
      factions: true,
      spells: false,
    });
  });
});
