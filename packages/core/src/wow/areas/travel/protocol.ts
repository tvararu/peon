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
export type ShowTaxiNodes = {
  npc: bigint;
  currentNode: number;
  known: readonly number[];
};
export type TaxiNodeStatus = { npc: bigint; known: boolean };

const TAXI_MASK_WORDS = 14;

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

export function parseShowTaxiNodes(r: PacketReader): ShowTaxiNodes {
  r.uint32LE();
  const npc = r.uint64LE();
  const currentNode = r.uint32LE();
  const known: number[] = [];
  for (let word = 0; word < TAXI_MASK_WORDS; word++) {
    const bits = r.uint32LE();
    for (let bit = 0; bit < 32; bit++)
      if ((bits & (1 << bit)) !== 0) known.push(word * 32 + bit + 1);
  }
  return { npc, currentNode, known };
}

export function parseTaxiNodeStatus(r: PacketReader): TaxiNodeStatus {
  const npc = r.uint64LE();
  return { npc, known: r.uint8() !== 0 };
}

export function buildBinderActivate(npc: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  return w.finish();
}

function buildTaxiGuid(npc: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  return w.finish();
}

export function buildTaxiNodeStatusQuery(npc: bigint): Uint8Array {
  return buildTaxiGuid(npc);
}

export function buildTaxiQueryAvailableNodes(npc: bigint): Uint8Array {
  return buildTaxiGuid(npc);
}

export function buildEnableTaxi(npc: bigint): Uint8Array {
  return buildTaxiGuid(npc);
}

export function buildSetTaxiBenchmarkMode(on: boolean): Uint8Array {
  const w = new PacketWriter();
  w.uint8(on ? 1 : 0);
  return w.finish();
}

export const ACTIVATE_TAXI_REPLY_NAMES = [
  "ok",
  "unspecified_server_error",
  "no_such_path",
  "not_enough_money",
  "too_far",
  "no_vendor_nearby",
  "not_visited",
  "busy",
  "mounted",
  "shapeshifted",
  "moving",
  "same_node",
  "not_standing",
] as const;

export type ActivateTaxiReplyName = (typeof ACTIVATE_TAXI_REPLY_NAMES)[number];

export type ActivateTaxiReply = { code: number; name: string };

export function parseActivateTaxiReply(r: PacketReader): ActivateTaxiReply {
  const code = r.uint32LE();
  const name =
    code < ACTIVATE_TAXI_REPLY_NAMES.length
      ? (ACTIVATE_TAXI_REPLY_NAMES[code] ?? `unknown_${code}`)
      : `unknown_${code}`;
  return { code, name };
}

export function buildActivateTaxi(
  npc: bigint,
  from: number,
  to: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  w.uint32LE(from);
  w.uint32LE(to);
  return w.finish();
}

export function buildActivateTaxiExpress(
  npc: bigint,
  nodes: readonly number[],
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  w.uint32LE(nodes.length);
  for (const node of nodes) w.uint32LE(node);
  return w.finish();
}
