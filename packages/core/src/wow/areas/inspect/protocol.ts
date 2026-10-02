import {
  type AchievementData,
  parseAchievementData,
} from "#wow/protocol/achievement-data";
import type { PacketReader } from "#wow/protocol/packet";
import { PacketWriter } from "#wow/protocol/packet";
import { readTalentSpec, type TalentSpec } from "#wow/protocol/talent-spec";

export type GearEnchant = { slot: number; id: number };
export type GearItem = {
  slot: number;
  entry: number;
  enchants: readonly GearEnchant[];
  randomProperty: number;
  creator: bigint;
  suffixFactor: number;
};
export type TalentSpecView = TalentSpec & { index: number; active: boolean };
export type InspectTalent = {
  guid: bigint;
  freePoints: number;
  short: boolean;
  specs: readonly TalentSpecView[];
  gear: readonly GearItem[];
};
export type RespondInspectAchievements = AchievementData & { guid: bigint };

export function spentPoints(spec: TalentSpec): number {
  let total = 0;
  for (const talent of spec.talents) total += talent.rank + 1;
  return total;
}

export function buildInspect(guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  return w.finish();
}

export function buildQueryInspectAchievements(guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(guid);
  return w.finish();
}

function parseGearItem(r: PacketReader, slot: number): GearItem {
  const entry = r.uint32LE();
  const mask = r.uint16LE();
  const enchants: GearEnchant[] = [];
  for (let j = 0; j < 12; j++) {
    if (mask & (1 << j)) enchants.push({ id: r.uint16LE(), slot: j });
  }
  const randomProperty = (r.uint16LE() << 16) >> 16;
  const creator = r.packedGuidBig();
  const suffixFactor = r.uint32LE();
  return { creator, enchants, entry, randomProperty, slot, suffixFactor };
}

export function parseInspectTalent(r: PacketReader): InspectTalent {
  const guid = r.packedGuidBig();
  const freePoints = r.uint32LE();
  const specCount = r.uint8();
  const activeSpec = r.uint8();
  const specs: TalentSpecView[] = [];
  for (let i = 0; i < specCount; i++) {
    const spec = readTalentSpec(r);
    specs.push({ ...spec, active: i === activeSpec, index: i });
  }
  const gear: GearItem[] = [];
  const mask = r.uint32LE();
  for (let slot = 0; slot < 19; slot++) {
    if (mask & (1 << slot)) gear.push(parseGearItem(r, slot));
  }
  return {
    freePoints,
    gear,
    guid,
    short: specCount === 0,
    specs,
  };
}

export function parseRespondInspectAchievements(
  r: PacketReader,
): RespondInspectAchievements {
  const guid = r.packedGuidBig();
  return { guid, ...parseAchievementData(r) };
}
