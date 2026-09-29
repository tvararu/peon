import { PacketWriter } from "#wow/protocol/packet";

export type ItemPosition = { bag: number; slot: number };

export function buildAutoEquipItem(from: ItemPosition): Uint8Array {
  const w = new PacketWriter();
  w.uint8(from.bag);
  w.uint8(from.slot);
  return w.finish();
}

export function buildAutoEquipItemSlot(
  itemGuid: bigint,
  slot: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(itemGuid);
  w.uint8(slot);
  return w.finish();
}

export function buildSwapItem(
  to: ItemPosition,
  from: ItemPosition,
): Uint8Array {
  const w = new PacketWriter();
  w.uint8(to.bag);
  w.uint8(to.slot);
  w.uint8(from.bag);
  w.uint8(from.slot);
  return w.finish();
}

export function buildSwapInvItem(toSlot: number, fromSlot: number): Uint8Array {
  const w = new PacketWriter();
  w.uint8(toSlot);
  w.uint8(fromSlot);
  return w.finish();
}

export function buildAutostoreBagItem(
  from: ItemPosition,
  toBag: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint8(from.bag);
  w.uint8(from.slot);
  w.uint8(toBag);
  return w.finish();
}

export function buildSplitItem(
  from: ItemPosition,
  to: ItemPosition,
  count: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint8(from.bag);
  w.uint8(from.slot);
  w.uint8(to.bag);
  w.uint8(to.slot);
  w.uint32LE(count);
  return w.finish();
}

export function buildSetAmmo(entry: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(entry);
  return w.finish();
}
