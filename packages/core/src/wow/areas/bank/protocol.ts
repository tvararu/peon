import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export const BUY_BANK_SLOT_RESULT = {
  too_many: 0,
  insufficient_funds: 1,
  not_banker: 2,
  ok: 3,
} as const;

const RESULT_NAMES: Record<number, string> = {
  [BUY_BANK_SLOT_RESULT.too_many]: "too_many",
  [BUY_BANK_SLOT_RESULT.insufficient_funds]: "insufficient_funds",
  [BUY_BANK_SLOT_RESULT.not_banker]: "not_banker",
  [BUY_BANK_SLOT_RESULT.ok]: "ok",
};

function byte(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 255)
    throw new Error(`${label} ${value} is not one byte`);
  return value;
}

export function buildBankerActivate(npc: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  return w.finish();
}

export function buildBuyBankSlot(npc: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  return w.finish();
}

export function buildAutobankItem(bag: number, slot: number): Uint8Array {
  const w = new PacketWriter();
  w.uint8(byte(bag, "bag"));
  w.uint8(byte(slot, "slot"));
  return w.finish();
}

export function buildAutostoreBankItem(bag: number, slot: number): Uint8Array {
  const w = new PacketWriter();
  w.uint8(byte(bag, "bag"));
  w.uint8(byte(slot, "slot"));
  return w.finish();
}

export type BuyBankSlotResult = { result: number; name: string };

export function buyBankSlotResultName(result: number): string {
  return RESULT_NAMES[result] ?? `bank_slot_result_${result}`;
}

export function parseBuyBankSlotResult(r: PacketReader): BuyBankSlotResult {
  const result = r.uint32LE();
  return { name: buyBankSlotResultName(result), result };
}
