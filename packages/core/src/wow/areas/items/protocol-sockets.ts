import type { PacketReader } from "#wow/protocol/packet";
import { PacketWriter } from "#wow/protocol/packet";

export const MAX_GEM_SOCKETS = 3;

export type SocketGemsResultPacket = {
  itemGuid: bigint;
  sockets: [number, number, number];
  bonus: number;
};
export type EnchantmentLogPacket = {
  target: bigint;
  caster: bigint;
  entry: number;
  enchantId: number;
};

export function buildSocketGems(
  itemGuid: bigint,
  gems: readonly bigint[],
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(itemGuid);
  for (let i = 0; i < MAX_GEM_SOCKETS; i++) w.uint64LE(gems[i] ?? 0n);
  return w.finish();
}

export function buildCancelTempEnchantment(slot: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(slot);
  return w.finish();
}

export function parseSocketGemsResult(r: PacketReader): SocketGemsResultPacket {
  return {
    itemGuid: r.uint64LE(),
    sockets: [r.uint32LE(), r.uint32LE(), r.uint32LE()],
    bonus: r.uint32LE(),
  };
}

export function parseEnchantmentLog(r: PacketReader): EnchantmentLogPacket {
  return {
    target: r.packedGuidBig(),
    caster: r.packedGuidBig(),
    entry: r.uint32LE(),
    enchantId: r.uint32LE(),
  };
}
