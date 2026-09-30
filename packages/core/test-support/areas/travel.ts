import { dbcFiles, packDbc } from "#test-support/dbc";
import type { DbcSource } from "#wow/dbc";
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

const TAXI_NAME_SLOTS = 16;

export function travelShowTaxiNodesBody(init: {
  npc: bigint;
  currentNode: number;
  mask: readonly number[];
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(1);
  w.uint64LE(init.npc);
  w.uint32LE(init.currentNode);
  for (const word of init.mask) w.uint32LE(word);
  return w.finish();
}

export function travelTaxiNodeStatusBody(init: {
  npc: bigint;
  known: boolean;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.npc);
  w.uint8(init.known ? 1 : 0);
  return w.finish();
}

export type TravelDbcNode = {
  id: number;
  map: number;
  x: number;
  y: number;
  z: number;
  name: string;
};
export type TravelDbcPath = {
  id: number;
  from: number;
  to: number;
  price: number;
};

function floatBits(value: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  return view.getUint32(0, true);
}

export function travelTaxiDbc(init: {
  nodes: readonly TravelDbcNode[];
  paths: readonly TravelDbcPath[];
  omit?: readonly string[];
}): DbcSource {
  const encoder = new TextEncoder();
  const chunks: number[] = [0];
  const nameOffsets = init.nodes.map((node) => {
    const offset = chunks.length;
    chunks.push(...encoder.encode(node.name), 0);
    return offset;
  });
  const nodeRows = init.nodes.map((node, index) => {
    const row = [
      node.id,
      node.map,
      floatBits(node.x),
      floatBits(node.y),
      floatBits(node.z),
    ];
    for (let slot = 0; slot < TAXI_NAME_SLOTS; slot++)
      row.push(slot === 0 ? (nameOffsets[index] ?? 0) : 0);
    row.push(0, 0, 0);
    return row;
  });
  const pathRows = init.paths.map((p) => [p.id, p.from, p.to, p.price]);
  const files = new Map<string, Uint8Array>([
    ["TaxiNodes.dbc", packDbc(24, nodeRows, Uint8Array.from(chunks))],
    ["TaxiPath.dbc", packDbc(4, pathRows)],
  ]);
  for (const file of init.omit ?? []) files.delete(file);
  return dbcFiles(files);
}
