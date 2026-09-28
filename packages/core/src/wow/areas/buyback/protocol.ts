import { PacketWriter } from "#wow/protocol/packet";

export const BUYBACK_FIRST_SLOT = 74;
export const BUYBACK_LAST_SLOT = 85;

export type BuyItemInSlot = {
  vendor: bigint;
  item: number;
  vendorSlot: number;
  bagGuid: bigint;
  bagSlot: number;
  count: number;
};

export function isBuybackSlot(slot: number): boolean {
  return (
    Number.isInteger(slot) &&
    slot >= BUYBACK_FIRST_SLOT &&
    slot <= BUYBACK_LAST_SLOT
  );
}

export function buildBuybackItem(vendor: bigint, slot: number): Uint8Array {
  if (!isBuybackSlot(slot))
    throw new Error(`buyback slot ${slot} is not in 74-85`);
  const w = new PacketWriter();
  w.uint64LE(vendor);
  w.uint32LE(slot);
  return w.finish();
}

export function buildBuyItemInSlot(buy: BuyItemInSlot): Uint8Array {
  if (!Number.isInteger(buy.vendorSlot) || buy.vendorSlot < 1)
    throw new Error(`vendor slot ${buy.vendorSlot} must be 1 or more`);
  const w = new PacketWriter();
  w.uint64LE(buy.vendor);
  w.uint32LE(buy.item);
  w.uint32LE(buy.vendorSlot);
  w.uint64LE(buy.bagGuid);
  w.uint8(buy.bagSlot);
  w.uint32LE(buy.count);
  return w.finish();
}
