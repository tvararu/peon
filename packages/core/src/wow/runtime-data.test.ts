import { afterEach, describe, expect, jest, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packDbc } from "#test-support/dbc";
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
const dirs: string[] = [];

async function dataDir(
  files: [file: string, fields: number][],
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "runtime-data-"));
  dirs.push(dir);
  await Promise.all(
    files.map(([file, fields]) =>
      Bun.write(join(dir, file), packDbc(fields, [])),
    ),
  );
  return dir;
}

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

describe("capabilitiesOf", () => {
  test("reports nothing when no data is configured or loaded", () => {
    expect(capabilitiesOf({}, { disposed: false })).toEqual({
      factions: false,
      spells: false,
      navigation: false,
      jev: false,
    });
  });

  test("navigation needs both paths and jev needs the key", () => {
    const lazy: LazyState = { disposed: false };
    expect(capabilitiesOf({ navigationDataDir: "d" }, lazy).navigation).toBe(
      false,
    );
    const full = {
      jevApiKey: "k",
      navigationDataDir: "d",
      navigationLibrary: "l",
    };
    expect(capabilitiesOf(full, lazy)).toMatchObject({
      jev: true,
      navigation: true,
    });
  });
});

describe("warmCatalogs", () => {
  test("does nothing without a spell data dir", () => {
    const lazy: LazyState = { disposed: false };
    warmCatalogs({}, lazy, { setCatalog: jest.fn() });
    expect(lazy.catalogPromise).toBeUndefined();
    expect(lazy.factionPromise).toBeUndefined();
  });

  test("loads both catalogs at once and marks each one loaded", async () => {
    const lazy: LazyState = { disposed: false };
    const combat = { setCatalog: jest.fn() };
    warmCatalogs({ spellDataDir: await dataDir(EMPTY_DBCS) }, lazy, combat);
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
    const dir = await dataDir([["FactionTemplate.dbc", 14]]);
    warmCatalogs({ spellDataDir: dir }, lazy, combat);
    await lazy.factionPromise;
    await expect(lazy.catalogPromise).rejects.toThrow(/Spell\.dbc/);
    expect(capabilitiesOf({}, lazy)).toMatchObject({
      factions: true,
      spells: false,
    });
  });
});
