import { type PacketReader, PacketWriter } from "#wow/protocol/packet";
import {
  readTalentRanks,
  readTalentSpec,
  type TalentRank,
  type TalentSpec,
} from "#wow/protocol/talent-spec";

export type PlayerTalentsInfo = {
  kind: "player";
  freePoints: number;
  specCount: number;
  activeSpec: number;
  specs: TalentSpec[];
};
export type PetTalentsInfo = {
  kind: "pet";
  freePoints: number;
  talents: TalentRank[];
};
export type TalentsInfo = PlayerTalentsInfo | PetTalentsInfo;

function readPlayer(r: PacketReader): PlayerTalentsInfo {
  const freePoints = r.uint32LE();
  const specCount = r.uint8();
  const activeSpec = r.uint8();
  const specs: TalentSpec[] = [];
  for (let i = 0; i < specCount; i++) specs.push(readTalentSpec(r));
  return { kind: "player", freePoints, specCount, activeSpec, specs };
}

function readPet(r: PacketReader): PetTalentsInfo {
  const freePoints = r.uint32LE();
  const talents = readTalentRanks(r);
  return { kind: "pet", freePoints, talents };
}

export function parseTalentsInfo(r: PacketReader): TalentsInfo {
  const type = r.uint8();
  if (type === 0) return readPlayer(r);
  if (type === 1) return readPet(r);
  throw new Error("unknown_talents_info_type");
}

export const MAX_PREVIEW_TALENTS = 150;

export function buildLearnTalent(entry: TalentRank): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(entry.talentId);
  w.uint32LE(entry.rank);
  return w.finish();
}

export function buildLearnPreviewTalents(
  entries: readonly TalentRank[],
): Uint8Array {
  if (entries.length > MAX_PREVIEW_TALENTS) throw new Error("too_many_talents");
  const w = new PacketWriter();
  w.uint32LE(entries.length);
  for (const entry of entries) {
    w.uint32LE(entry.talentId);
    w.uint32LE(entry.rank);
  }
  return w.finish();
}

export type TalentWipeOffer = { npcGuid: bigint; cost: number };

export function parseTalentWipeOffer(r: PacketReader): TalentWipeOffer {
  return { npcGuid: r.uint64LE(), cost: r.uint32LE() };
}

export function buildTalentWipeConfirm(npcGuid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npcGuid);
  return w.finish();
}

export const MAX_GLYPH_SLOT = 5;

export function buildRemoveGlyph(slot: number): Uint8Array {
  if (!Number.isInteger(slot) || slot < 0 || slot > MAX_GLYPH_SLOT)
    throw new Error("bad_glyph_slot");
  const w = new PacketWriter();
  w.uint32LE(slot);
  return w.finish();
}
