import { describe, expect, test } from "bun:test";
import {
  TALENTS_TAB_NAMES,
  talentsCatalogFiles,
} from "#test-support/areas/talents";
import { dbcFiles, packDbc } from "#test-support/dbc";
import { loadTalentCatalog, TALENT_LAYOUTS } from "#wow/areas/talents/catalog";

const WARRIOR = 1;
const MAGE = 8;

function loadFixture() {
  return loadTalentCatalog(dbcFiles(talentsCatalogFiles()));
}

describe("loadTalentCatalog", () => {
  test("reads a talent with its rank spells and prerequisite", async () => {
    const catalog = await loadFixture();
    expect(catalog.talent(1)).toEqual({
      column: 1,
      id: 1,
      ranks: [12_282, 12_663, 12_664],
      row: 0,
      tab: 161,
    });
    expect(catalog.talent(2)).toEqual({
      column: 1,
      id: 2,
      ranks: [29_723],
      requires: { rank: 2, talentId: 1 },
      row: 1,
      tab: 161,
    });
  });

  test("returns undefined for unknown ids", async () => {
    const catalog = await loadFixture();
    expect(catalog.talent(9999)).toBeUndefined();
    expect(catalog.tab(9999)).toBeUndefined();
    expect(catalog.glyph(9999)).toBeUndefined();
    expect(catalog.slotType(9999)).toBeUndefined();
  });

  test("reads a tab with its class mask, pet mask, page and name", async () => {
    const catalog = await loadFixture();
    expect(catalog.tab(161)).toEqual({
      classMask: 1 << (WARRIOR - 1),
      id: 161,
      name: TALENTS_TAB_NAMES.arms,
      page: 0,
      petMask: 0,
    });
    expect(catalog.tab(409)?.petMask).toBe(2);
    expect(catalog.tab(409)?.classMask).toBe(0);
  });

  test("lists one class and leaves pet tabs out", async () => {
    const catalog = await loadFixture();
    expect(catalog.talentsForClass(WARRIOR).map((t) => t.id)).toEqual([1, 2]);
    expect(catalog.talentsForClass(MAGE).map((t) => t.id)).toEqual([3]);
    expect(catalog.talentsForClass(2)).toEqual([]);
  });

  test("reads glyph properties and glyph slots", async () => {
    const catalog = await loadFixture();
    expect(catalog.glyph(21)).toEqual({
      id: 21,
      spellId: 58_366,
      typeFlags: 0,
    });
    expect(catalog.glyph(22)?.typeFlags).toBe(1);
    expect(catalog.slotType(21)).toEqual({
      order: 1,
      typeFlags: 0,
    });
    expect(catalog.slotType(23)).toEqual({
      order: 2,
      typeFlags: 1,
    });
  });

  test("finds the slot row whose order is index + 1", async () => {
    const catalog = await loadFixture();
    expect(catalog.slotForIndex(0)).toEqual({
      id: 21,
      order: 1,
      typeFlags: 0,
    });
    expect(catalog.slotForIndex(1)?.id).toBe(23);
    expect(catalog.slotForIndex(2)).toBeUndefined();
  });

  test("rejects with missing_spell_data when a file is absent", async () => {
    for (const { file } of Object.values(TALENT_LAYOUTS)) {
      const files = talentsCatalogFiles();
      files.delete(file);
      await expect(loadTalentCatalog(dbcFiles(files))).rejects.toThrow(
        "missing_spell_data",
      );
    }
  });

  test("rejects with missing_spell_data on a wrong layout", async () => {
    const files = talentsCatalogFiles();
    files.set("Talent.dbc", packDbc(4, [[1, 1, 0, 0]]));
    await expect(loadTalentCatalog(dbcFiles(files))).rejects.toThrow(
      "missing_spell_data",
    );
  });
});
