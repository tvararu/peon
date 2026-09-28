import { PacketWriter } from "#wow/protocol/packet";

function packedOrZero(w: PacketWriter, guid: bigint | undefined): void {
  if (guid === undefined) w.uint8(0);
  else w.packedGuidBig(guid);
}

export function lootingLootListBody(init: {
  creature: bigint;
  master?: bigint;
  looter?: bigint;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.creature);
  packedOrZero(w, init.master);
  packedOrZero(w, init.looter);
  return w.finish();
}
