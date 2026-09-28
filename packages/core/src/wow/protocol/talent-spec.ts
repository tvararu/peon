import type { PacketReader } from "#wow/protocol/packet";

export type TalentRank = { talentId: number; rank: number };
export type TalentSpec = { talents: TalentRank[]; glyphs: number[] };

export function readTalentRanks(r: PacketReader): TalentRank[] {
  const count = r.uint8();
  const talents: TalentRank[] = [];
  for (let i = 0; i < count; i++) {
    const talentId = r.uint32LE();
    const rank = r.uint8();
    talents.push({ talentId, rank });
  }
  return talents;
}

export function readTalentSpec(r: PacketReader): TalentSpec {
  const talents = readTalentRanks(r);
  const glyphCount = r.uint8();
  const glyphs: number[] = [];
  for (let i = 0; i < glyphCount; i++) glyphs.push(r.uint16LE());
  return { talents, glyphs };
}
