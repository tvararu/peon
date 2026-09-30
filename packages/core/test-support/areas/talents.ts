import { packDbc } from "#test-support/dbc";
import { PacketWriter } from "#wow/protocol/packet";
import type { TalentRank } from "#wow/protocol/talent-spec";

export type TalentsSpecInit = {
  talents?: readonly TalentRank[];
  glyphs?: readonly number[];
};

const NO_GLYPHS = [0, 0, 0, 0, 0, 0];

function writeRanks(w: PacketWriter, talents: readonly TalentRank[]) {
  w.uint8(talents.length);
  for (const talent of talents) {
    w.uint32LE(talent.talentId);
    w.uint8(talent.rank);
  }
}

function writeSpec(w: PacketWriter, spec: TalentsSpecInit) {
  writeRanks(w, spec.talents ?? []);
  const glyphs = spec.glyphs ?? NO_GLYPHS;
  w.uint8(glyphs.length);
  for (const glyph of glyphs) w.uint16LE(glyph);
}

export function talentsSpecBlock(spec: TalentsSpecInit = {}): Uint8Array {
  const w = new PacketWriter();
  writeSpec(w, spec);
  return w.finish();
}

export function talentsTalentsInfoBody(init: {
  freePoints: number;
  activeSpec?: number;
  specs: readonly TalentsSpecInit[];
}): Uint8Array {
  const w = new PacketWriter();
  w.uint8(0);
  w.uint32LE(init.freePoints);
  w.uint8(init.specs.length);
  w.uint8(init.activeSpec ?? 0);
  for (const spec of init.specs) writeSpec(w, spec);
  return w.finish();
}

export function talentsTalentsInfoPetBody(
  init: { freePoints?: number; talents?: readonly TalentRank[] } = {},
): Uint8Array {
  const w = new PacketWriter();
  w.uint8(1);
  w.uint32LE(init.freePoints ?? 0);
  writeRanks(w, init.talents ?? []);
  return w.finish();
}

export type TalentDbcRow = {
  id: number;
  tab: number;
  row: number;
  column: number;
  ranks?: readonly number[];
  requiresTalent?: number;
  requiresRank?: number;
};

export type TalentTabDbcRow = {
  id: number;
  name: string;
  classMask: number;
  petMask?: number;
  page?: number;
};

export type GlyphDbcRow = { id: number; spellId: number; typeFlags: number };

export type GlyphSlotDbcRow = { id: number; typeFlags: number; order: number };

export function talentsTalentDbc(rows: readonly TalentDbcRow[]): Uint8Array {
  const cells = rows.map((init) => {
    const row = new Array<number>(23).fill(0);
    row[0] = init.id;
    row[1] = init.tab;
    row[2] = init.row;
    row[3] = init.column;
    for (let i = 0; i < (init.ranks ?? []).length && i < 5; i++)
      row[4 + i] = init.ranks?.[i] ?? 0;
    row[13] = init.requiresTalent ?? 0;
    row[16] = init.requiresRank ?? 0;
    return row;
  });
  return packDbc(23, cells);
}

export function talentsTabDbc(rows: readonly TalentTabDbcRow[]): Uint8Array {
  let text = "\0";
  const cells = rows.map((init) => {
    const row = new Array<number>(24).fill(0);
    row[0] = init.id;
    row[1] = text.length;
    text += `${init.name}\0`;
    row[20] = init.classMask;
    row[21] = init.petMask ?? 0;
    row[22] = init.page ?? 0;
    return row;
  });
  return packDbc(24, cells, new TextEncoder().encode(text));
}

export function talentsGlyphDbc(rows: readonly GlyphDbcRow[]): Uint8Array {
  return packDbc(
    4,
    rows.map((init) => [init.id, init.spellId, init.typeFlags, 0]),
  );
}

export function talentsGlyphSlotDbc(
  rows: readonly GlyphSlotDbcRow[],
): Uint8Array {
  return packDbc(
    3,
    rows.map((init) => [init.id, init.typeFlags, init.order]),
  );
}

export const TALENTS_TAB_NAMES = { arms: "Arms", fire: "Fire" } as const;

export function talentsCatalogFiles(): Map<string, Uint8Array> {
  const warrior = 1 << (1 - 1);
  const mage = 1 << (8 - 1);
  return new Map([
    [
      "Talent.dbc",
      talentsTalentDbc([
        { column: 1, id: 1, ranks: [12_282, 12_663, 12_664], row: 0, tab: 161 },
        {
          column: 1,
          id: 2,
          ranks: [29_723],
          requiresRank: 2,
          requiresTalent: 1,
          row: 1,
          tab: 161,
        },
        { column: 0, id: 3, ranks: [11_113], row: 0, tab: 41 },
      ]),
    ],
    [
      "TalentTab.dbc",
      talentsTabDbc([
        { classMask: warrior, id: 161, name: TALENTS_TAB_NAMES.arms, page: 0 },
        { classMask: mage, id: 41, name: TALENTS_TAB_NAMES.fire, page: 0 },
        { classMask: 0, id: 409, name: "Tenacity", page: 0, petMask: 2 },
      ]),
    ],
    [
      "GlyphProperties.dbc",
      talentsGlyphDbc([
        { id: 21, spellId: 58_366, typeFlags: 0 },
        { id: 22, spellId: 12_297, typeFlags: 1 },
      ]),
    ],
    [
      "GlyphSlot.dbc",
      talentsGlyphSlotDbc([
        { id: 21, order: 1, typeFlags: 0 },
        { id: 23, order: 2, typeFlags: 1 },
      ]),
    ],
  ]);
}
