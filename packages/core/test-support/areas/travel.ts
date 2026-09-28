import { PacketWriter } from "#wow/protocol/packet";

export function travelBindPointUpdateBody(init: {
  x: number;
  y: number;
  z: number;
  mapId: number;
  areaId: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.floatLE(init.x);
  w.floatLE(init.y);
  w.floatLE(init.z);
  w.uint32LE(init.mapId);
  w.uint32LE(init.areaId);
  return w.finish();
}

export function travelPlayerBoundBody(init: {
  binder: bigint;
  areaId: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.binder);
  w.uint32LE(init.areaId);
  return w.finish();
}

export function travelBinderConfirmBody(npc: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  return w.finish();
}
