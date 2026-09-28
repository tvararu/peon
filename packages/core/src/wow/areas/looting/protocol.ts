import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type LootList = { creature: bigint; master: bigint; looter: bigint };

export function parseLootList(r: PacketReader): LootList {
  const creature = r.uint64LE();
  const master = r.packedGuidBig();
  const looter = r.packedGuidBig();
  return { creature, master, looter };
}

export function buildOptOutOfLoot(pass: boolean): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(pass ? 1 : 0);
  return w.finish();
}

export const LOOT_METHOD_NAMES = [
  "free_for_all",
  "round_robin",
  "master_loot",
  "group_loot",
  "need_before_greed",
] as const;
export type LootMethodName = (typeof LOOT_METHOD_NAMES)[number];

export const LOOT_THRESHOLD_NAMES = [
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "artifact",
] as const;
export type LootThresholdName = (typeof LOOT_THRESHOLD_NAMES)[number];

export const LOWEST_LOOT_THRESHOLD = 2;

export function buildLootMethod(
  method: number,
  master: bigint,
  threshold: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(method);
  w.uint64LE(master);
  w.uint32LE(threshold);
  return w.finish();
}
