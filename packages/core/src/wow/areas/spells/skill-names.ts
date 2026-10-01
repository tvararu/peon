import type { DbcSource } from "#wow/dbc";
import { localeString, openDbc, u32 } from "#wow/dbc";

export type SkillCatalog = {
  isPrimary: (id: number) => boolean;
  isProfession: (id: number) => boolean;
  nameOf: (id: number) => string;
};

const PROFESSION_CATEGORY = 11;

const SECONDARY_CATEGORY = 9;

const SECONDARY_PROFESSIONS: Record<number, true> = {
  129: true,
  185: true,
  356: true,
};

type NamedSkill = { readonly name: string; readonly primary: boolean };

const STATIC_SKILLS: Record<number, NamedSkill> = {
  129: { name: "First Aid", primary: false },
  164: { name: "Blacksmithing", primary: true },
  165: { name: "Leatherworking", primary: true },
  171: { name: "Alchemy", primary: true },
  182: { name: "Herbalism", primary: true },
  185: { name: "Cooking", primary: false },
  186: { name: "Mining", primary: true },
  197: { name: "Tailoring", primary: true },
  202: { name: "Engineering", primary: true },
  333: { name: "Enchanting", primary: true },
  356: { name: "Fishing", primary: false },
  393: { name: "Skinning", primary: true },
  755: { name: "Jewelcrafting", primary: true },
  762: { name: "Riding", primary: false },
  773: { name: "Inscription", primary: true },
};

export const SKILL_LINE_LAYOUT = {
  file: "SkillLine.dbc",
  fields: 56,
  recordSize: 224,
} as const;

const SKILL_LINE_NAME = 3;

function staticCatalog(): SkillCatalog {
  return {
    isPrimary: (id) => STATIC_SKILLS[id]?.primary ?? false,
    isProfession: (id) =>
      STATIC_SKILLS[id]?.primary === true || SECONDARY_PROFESSIONS[id] === true,
    nameOf: (id) => STATIC_SKILLS[id]?.name ?? `skill ${id}`,
  };
}

export const STATIC_SKILL_CATALOG: SkillCatalog = staticCatalog();

function withFileRows(
  rows: ReadonlyMap<number, { category: number; name: string }>,
): SkillCatalog {
  const base = staticCatalog();
  return {
    isPrimary: (id) => rows.get(id)?.category === PROFESSION_CATEGORY,
    isProfession: (id) =>
      rows.get(id)?.category === PROFESSION_CATEGORY ||
      (rows.get(id) === undefined && base.isProfession(id)) ||
      (rows.get(id)?.category === SECONDARY_CATEGORY &&
        SECONDARY_PROFESSIONS[id] === true),
    nameOf: (id) => {
      const row = rows.get(id);
      if (row && row.name.length > 0) return row.name;
      return base.nameOf(id);
    },
  };
}

export async function loadSkillCatalog(
  source: DbcSource,
): Promise<SkillCatalog> {
  const file = await openDbc(source, SKILL_LINE_LAYOUT);
  const rows = new Map<number, { category: number; name: string }>();
  for (let row = 0; row < file.recordCount; row++) {
    const id = u32(file, row, 0);
    if (id === 0) continue;
    rows.set(id, {
      category: u32(file, row, 1),
      name: localeString(file, row, SKILL_LINE_NAME),
    });
  }
  return withFileRows(rows);
}
