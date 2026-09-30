import {
  type DbcFile,
  type DbcSource,
  DbcTable,
  localeString,
  openDbc,
  u32,
} from "#wow/dbc";

export type TalentEntry = {
  id: number;
  tab: number;
  row: number;
  column: number;
  ranks: number[];
  requires?: { talentId: number; rank: number };
};

export type TalentTabEntry = {
  id: number;
  name: string;
  classMask: number;
  petMask: number;
  page: number;
};

export type GlyphEntry = {
  id: number;
  spellId: number;
  typeFlags: number;
};

export type GlyphSlotEntry = {
  id: number;
  typeFlags: number;
  order: number;
};

export const TALENT_LAYOUTS = {
  talent: { fields: 23, file: "Talent.dbc", recordSize: 92 },
  tab: { fields: 24, file: "TalentTab.dbc", recordSize: 96 },
  glyph: { fields: 4, file: "GlyphProperties.dbc", recordSize: 16 },
  slot: { fields: 3, file: "GlyphSlot.dbc", recordSize: 12 },
} as const;

function spellRanks(file: DbcFile, row: number): number[] {
  const ranks: number[] = [];
  for (let col = 4; col <= 8; col++) {
    const spell = u32(file, row, col);
    if (spell !== 0) ranks.push(spell);
  }
  return ranks;
}

function decodeTalent(file: DbcFile, row: number): TalentEntry {
  const requiresTalent = u32(file, row, 13);
  const entry: TalentEntry = {
    column: u32(file, row, 3),
    id: u32(file, row, 0),
    ranks: spellRanks(file, row),
    row: u32(file, row, 2),
    tab: u32(file, row, 1),
  };
  if (requiresTalent !== 0)
    entry.requires = {
      rank: u32(file, row, 16),
      talentId: requiresTalent,
    };
  return entry;
}

function decodeTab(file: DbcFile, row: number): TalentTabEntry {
  return {
    classMask: u32(file, row, 20),
    id: u32(file, row, 0),
    name: localeString(file, row, 1),
    page: u32(file, row, 22),
    petMask: u32(file, row, 21),
  };
}

function decodeGlyph(file: DbcFile, row: number): GlyphEntry {
  return {
    id: u32(file, row, 0),
    spellId: u32(file, row, 1),
    typeFlags: u32(file, row, 2),
  };
}

function decodeSlot(file: DbcFile, row: number): GlyphSlotEntry {
  return {
    id: u32(file, row, 0),
    order: u32(file, row, 2),
    typeFlags: u32(file, row, 1),
  };
}

export class TalentCatalog {
  private readonly talents: DbcTable<TalentEntry>;
  private readonly tabs: DbcTable<TalentTabEntry>;
  private readonly glyphs: DbcTable<GlyphEntry>;
  private readonly slots: DbcTable<GlyphSlotEntry>;
  private readonly slotFile: DbcFile;

  constructor(files: {
    talent: DbcFile;
    tab: DbcFile;
    glyph: DbcFile;
    slot: DbcFile;
  }) {
    this.talents = new DbcTable(files.talent, decodeTalent);
    this.tabs = new DbcTable(files.tab, decodeTab);
    this.glyphs = new DbcTable(files.glyph, decodeGlyph);
    this.slots = new DbcTable(files.slot, decodeSlot);
    this.slotFile = files.slot;
  }

  talent(id: number): TalentEntry | undefined {
    return this.talents.get(id);
  }

  tab(id: number): TalentTabEntry | undefined {
    return this.tabs.get(id);
  }

  talentsForClass(classId: number): TalentEntry[] {
    const mask = 1 << (classId - 1);
    const entries: TalentEntry[] = [];
    for (const id of this.talents.file.byId.keys()) {
      const talent = this.talents.get(id);
      const tab = talent ? this.tabs.get(talent.tab) : undefined;
      if (talent && tab && tab.petMask === 0 && tab.classMask & mask)
        entries.push(talent);
    }
    return entries.sort((a, b) => a.id - b.id);
  }

  glyph(id: number): GlyphEntry | undefined {
    return this.glyphs.get(id);
  }

  slotType(typeId: number): { typeFlags: number; order: number } | undefined {
    const slot = this.slots.get(typeId);
    if (!slot) return undefined;
    return { order: slot.order, typeFlags: slot.typeFlags };
  }

  slotForIndex(index: number): GlyphSlotEntry | undefined {
    const want = index + 1;
    for (const id of this.slotFile.byId.keys()) {
      const slot = this.slots.get(id);
      if (slot && slot.order === want) return slot;
    }
    return undefined;
  }
}

export async function loadTalentCatalog(
  source: DbcSource,
): Promise<TalentCatalog> {
  try {
    const [talent, tab, glyph, slot] = await Promise.all([
      openDbc(source, TALENT_LAYOUTS.talent),
      openDbc(source, TALENT_LAYOUTS.tab),
      openDbc(source, TALENT_LAYOUTS.glyph),
      openDbc(source, TALENT_LAYOUTS.slot),
    ]);
    return new TalentCatalog({ glyph, slot, tab, talent });
  } catch (cause) {
    throw new Error("missing_spell_data", { cause });
  }
}
