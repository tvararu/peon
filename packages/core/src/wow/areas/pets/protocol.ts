import type { PacketReader } from "#wow/protocol/packet";

export function parsePetSpellId(r: PacketReader): number {
  return r.uint32LE();
}

export function buildRequestPetInfo(): Uint8Array {
  return new Uint8Array();
}
