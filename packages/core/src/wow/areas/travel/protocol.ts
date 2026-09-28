import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type BindPoint = {
  x: number;
  y: number;
  z: number;
  mapId: number;
  areaId: number;
};
export type PlayerBound = { binder: bigint; areaId: number };
export type BinderConfirm = { npc: bigint };

export function parseBindPointUpdate(r: PacketReader): BindPoint {
  const x = r.floatLE();
  const y = r.floatLE();
  const z = r.floatLE();
  const mapId = r.uint32LE();
  const areaId = r.uint32LE();
  return { x, y, z, mapId, areaId };
}

export function parsePlayerBound(r: PacketReader): PlayerBound {
  const binder = r.uint64LE();
  const areaId = r.uint32LE();
  return { binder, areaId };
}

export function parseBinderConfirm(r: PacketReader): BinderConfirm {
  return { npc: r.uint64LE() };
}

export function buildBinderActivate(npc: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  return w.finish();
}
