import type { ItemPosition } from "#wow/areas/items/protocol";
import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type ReadItemResult = { guid: bigint };
export type ItemTextResponse =
  | { found: true; guid: bigint; text: string }
  | { found: false };

function position({ bag, slot }: ItemPosition): Uint8Array {
  const w = new PacketWriter();
  w.uint8(bag);
  w.uint8(slot);
  return w.finish();
}

export function buildOpenItem(from: ItemPosition): Uint8Array {
  return position(from);
}

export function buildReadItem(from: ItemPosition): Uint8Array {
  return position(from);
}

export function buildItemTextQuery(guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  return w.finish();
}

export function parseReadItemResult(r: PacketReader): ReadItemResult {
  return { guid: r.uint64LE() };
}

export function parseItemTextResponse(r: PacketReader): ItemTextResponse {
  if (r.uint8() !== 0) return { found: false };
  const guid = r.uint64LE();
  return { found: true, guid, text: r.cString() };
}
