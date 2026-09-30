import { describe, expect, test } from "bun:test";
import { dbcFiles, packDbc } from "#test-support/dbc";
import {
  loadSkillCatalog,
  SKILL_LINE_LAYOUT,
  STATIC_SKILL_CATALOG,
} from "#wow/areas/spells/skill-names";

const PRIMARY = [
  [171, "Alchemy"],
  [164, "Blacksmithing"],
  [333, "Enchanting"],
  [202, "Engineering"],
  [182, "Herbalism"],
  [773, "Inscription"],
  [755, "Jewelcrafting"],
  [165, "Leatherworking"],
  [186, "Mining"],
  [393, "Skinning"],
  [197, "Tailoring"],
] as const;

describe("static skill catalog", () => {
  test("names and accepts every primary profession", () => {
    for (const [id, name] of PRIMARY) {
      expect(STATIC_SKILL_CATALOG.nameOf(id)).toBe(name);
      expect(STATIC_SKILL_CATALOG.isPrimary(id)).toBe(true);
    }
  });

  test("names secondary professions but does not accept them as primary", () => {
    const secondary = [
      [185, "Cooking"],
      [129, "First Aid"],
      [356, "Fishing"],
      [762, "Riding"],
    ] as const;
    for (const [id, name] of secondary) {
      expect(STATIC_SKILL_CATALOG.nameOf(id)).toBe(name);
      expect(STATIC_SKILL_CATALOG.isPrimary(id)).toBe(false);
    }
  });

  test("an unnamed skill reads as skill <id>", () => {
    expect(STATIC_SKILL_CATALOG.nameOf(43)).toBe("skill 43");
    expect(STATIC_SKILL_CATALOG.isPrimary(43)).toBe(false);
  });
});

function skillLine(id: number, category: number, name: number): number[] {
  const row = new Array<number>(SKILL_LINE_LAYOUT.fields).fill(0);
  row[0] = id;
  row[1] = category;
  row[3] = name;
  return row;
}

describe("loadSkillCatalog", () => {
  const strings = new TextEncoder().encode("\0Mining\0Axes\0");
  const file = packDbc(
    SKILL_LINE_LAYOUT.fields,
    [skillLine(186, 11, 1), skillLine(44, 6, 8), skillLine(999, 11, 0)],
    strings,
  );
  const source = dbcFiles(new Map([[SKILL_LINE_LAYOUT.file, file]]));

  test("reads names and the profession category from SkillLine.dbc", async () => {
    const catalog = await loadSkillCatalog(source);
    expect(catalog.nameOf(186)).toBe("Mining");
    expect(catalog.nameOf(44)).toBe("Axes");
    expect(catalog.isPrimary(186)).toBe(true);
    expect(catalog.isPrimary(44)).toBe(false);
  });

  test("a row with no name reads as skill <id>; ids outside the file use the static names", async () => {
    const catalog = await loadSkillCatalog(source);
    expect(catalog.nameOf(999)).toBe("skill 999");
    expect(catalog.isPrimary(999)).toBe(true);
    expect(catalog.nameOf(171)).toBe("Alchemy");
  });

  test("a missing file rejects", async () => {
    await expect(loadSkillCatalog(dbcFiles(new Map()))).rejects.toThrow(
      /SkillLine\.dbc/,
    );
  });
});
