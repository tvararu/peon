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
