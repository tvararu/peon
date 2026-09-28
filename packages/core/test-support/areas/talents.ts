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
