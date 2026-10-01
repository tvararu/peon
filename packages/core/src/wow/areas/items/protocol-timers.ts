import type { PacketReader } from "#wow/protocol/packet";

export type ItemCooldownPacket = { itemGuid: bigint; spell: number };
export type ItemTimeUpdatePacket = { itemGuid: bigint; seconds: number };
export type ItemEnchantTimeUpdatePacket = {
  itemGuid: bigint;
  slot: number;
  seconds: number;
  playerGuid: bigint;
};
export type SetProficiencyPacket = { itemClass: number; mask: number };

export function parseItemCooldown(r: PacketReader): ItemCooldownPacket {
  return { itemGuid: r.uint64LE(), spell: r.uint32LE() };
}

export function parseItemTimeUpdate(r: PacketReader): ItemTimeUpdatePacket {
  return { itemGuid: r.uint64LE(), seconds: r.uint32LE() };
}

export function parseItemEnchantTimeUpdate(
  r: PacketReader,
): ItemEnchantTimeUpdatePacket {
  return {
    itemGuid: r.uint64LE(),
    slot: r.uint32LE(),
    seconds: r.uint32LE(),
    playerGuid: r.uint64LE(),
  };
}

export function parseSetProficiency(r: PacketReader): SetProficiencyPacket {
  return { itemClass: r.uint8(), mask: r.uint32LE() };
}
