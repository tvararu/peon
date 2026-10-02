import type { DbcSource } from "@peon/core";

export type StopNode = { name: string; mapId: number; x: number; y: number };
export type DockAt = { mapId: number; x: number; y: number };

export const STOP_RANGE_YD = 700;

const FILE = "TaxiNodes.dbc";
const FIELDS = 24;
const RECORD_BYTES = 96;
const HEADER_BYTES = 20;
const NAME_FIELD = 5;
const utf8 = new TextDecoder("utf-8");

function stringAt(strings: Uint8Array, offset: number): string {
  let end = offset;
  while (end < strings.byteLength && strings[end] !== 0) end++;
  return utf8.decode(strings.subarray(offset, end));
}

export async function readNodes(source: DbcSource): Promise<StopNode[]> {
  const bytes = await source(FILE);
  if (bytes.byteLength < HEADER_BYTES) throw new Error(`${FILE}: truncated`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(4, true);
  if (
    view.getUint32(8, true) !== FIELDS ||
    view.getUint32(12, true) !== RECORD_BYTES
  )
    throw new Error(`${FILE}: unsupported layout`);
  const strings = bytes.subarray(HEADER_BYTES + count * RECORD_BYTES);
  const nodes: StopNode[] = [];
  for (let row = 0; row < count; row++) {
    const at = HEADER_BYTES + row * RECORD_BYTES;
    const offset = view.getUint32(at + NAME_FIELD * 4, true);
    if (offset >= strings.byteLength) continue;
    nodes.push({
      mapId: view.getUint32(at + 4, true),
      name: stringAt(strings, offset),
      x: view.getFloat32(at + 8, true),
      y: view.getFloat32(at + 12, true),
    });
  }
  return nodes;
}

export function namesNear(nodes: readonly StopNode[], at: DockAt): string[] {
  return nodes
    .filter(
      (node) =>
        node.mapId === at.mapId &&
        Math.hypot(node.x - at.x, node.y - at.y) <= STOP_RANGE_YD,
    )
    .map((node) => node.name);
}

export function servesStop(
  nodes: readonly StopNode[],
  at: DockAt,
  stop: string,
): boolean {
  const needle = stop.trim().toLowerCase();
  if (needle === "") return false;
  return namesNear(nodes, at).some((name) =>
    name.toLowerCase().includes(needle),
  );
}
