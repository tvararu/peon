import type { ItemPosition } from "#wow/areas/items/protocol";
import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type ItemNameResponse = {
  entry: number;
  name: string;
  inventoryType: number;
};

export function buildWrapItem(
  gift: ItemPosition,
  item: ItemPosition,
): Uint8Array {
  const w = new PacketWriter();
  w.uint8(gift.bag);
  w.uint8(gift.slot);
  w.uint8(item.bag);
  w.uint8(item.slot);
  return w.finish();
}

export function buildItemNameQuery(entry: number, guid = 0n): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(entry);
  w.uint64LE(guid);
  return w.finish();
}

export function parseItemNameResponse(r: PacketReader): ItemNameResponse {
  const entry = r.uint32LE();
  const name = r.cString();
  return { entry, name, inventoryType: r.uint32LE() };
}
