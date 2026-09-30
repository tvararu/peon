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

export const SELF_MASTER = "@self";

export type LootMasterList = { candidates: readonly bigint[] };

export function parseLootMasterList(r: PacketReader): LootMasterList {
  const count = r.uint8();
  const candidates: bigint[] = [];
  for (let i = 0; i < count; i++) candidates.push(r.uint64LE());
  return { candidates };
}

export function buildLootMasterGive(
  lootGuid: bigint,
  slot: number,
  target: bigint,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(lootGuid);
  w.uint8(slot);
  w.uint64LE(target);
  return w.finish();
}

const LOOT_ERROR_NAMES: Record<number, string> = {
  0: "no permission to loot that corpse",
  4: "too far away to loot that corpse",
  5: "must be facing the corpse to loot it",
  6: "someone is already looting that corpse",
  8: "need to be standing up to loot something",
  9: "can't loot anything while stunned",
  10: "player not found",
  11: "maximum play time exceeded",
  12: "that player's inventory is full",
  13: "player has too many of that item already",
  14: "can't assign item to that player",
  15: "your target has already had its pockets picked",
  16: "can't do that while shapeshifted",
};

export function lootErrorName(error: number): string {
  return LOOT_ERROR_NAMES[error] ?? `loot error ${error}`;
}
