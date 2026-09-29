import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type TradeStatusDetail =
  | { kind: "none" }
  | { kind: "trader"; trader: bigint }
  | { kind: "open_window"; tradeId: number }
  | {
      kind: "close_window";
      result: number;
      isTarget: boolean;
      limitItem: number;
    }
  | { kind: "slot"; slot: number };

export type TradeStatus = TradeStatusDetail & {
  status: number;
  statusName: string;
};

const STATUS_NAMES: Record<number, string> = {
  0: "busy",
  1: "begin_trade",
  2: "open_window",
  3: "trade_canceled",
  4: "trade_accept",
  5: "busy_2",
  6: "no_target",
  7: "back_to_trade",
  8: "trade_complete",
  9: "trade_rejected",
  10: "target_to_far",
  11: "wrong_faction",
  12: "close_window",
  14: "ignore_you",
  15: "you_stunned",
  16: "target_stunned",
  17: "you_dead",
  18: "target_dead",
  19: "you_logout",
  20: "target_logout",
  21: "trial_account",
  22: "wrong_realm",
  23: "not_on_taplist",
};

export function tradeStatusName(status: number): string {
  return STATUS_NAMES[status] ?? `trade_status_${status}`;
}

export function parseTradeStatus(
  reader: PacketReader,
): TradeStatus | undefined {
  if (reader.remaining < 4) return undefined;
  const status = reader.uint32LE();
  const statusName = tradeStatusName(status);
  if (status === 1) {
    if (reader.remaining < 8) return undefined;
    return { kind: "trader", status, statusName, trader: reader.uint64LE() };
  }
  if (status === 2) {
    if (reader.remaining < 4) return undefined;
    return {
      kind: "open_window",
      status,
      statusName,
      tradeId: reader.uint32LE(),
    };
  }
  if (status === 12) {
    if (reader.remaining < 9) return undefined;
    const result = reader.uint32LE();
    const isTarget = reader.uint8() !== 0;
    const limitItem = reader.uint32LE();
    return {
      isTarget,
      kind: "close_window",
      limitItem,
      result,
      status,
      statusName,
    };
  }
  if (status === 22 || status === 23) {
    if (reader.remaining < 1) return undefined;
    return { kind: "slot", slot: reader.uint8(), status, statusName };
  }
  return { kind: "none", status, statusName };
}

export function buildInitiateTrade(guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  return w.finish();
}

export function buildBeginTrade(): Uint8Array {
  return new PacketWriter().finish();
}

export function buildBusyTrade(): Uint8Array {
  return new PacketWriter().finish();
}

export function buildIgnoreTrade(): Uint8Array {
  return new PacketWriter().finish();
}

export function buildCancelTrade(): Uint8Array {
  return new PacketWriter().finish();
}

export type TradeExtendedItem = {
  slot: number;
  entry: number;
  display: number;
  count: number;
  wrapped: boolean;
  giftCreator: bigint;
  permanentEnchant: number;
  gemEnchants: readonly [number, number, number];
  creator: bigint;
  charges: number;
  suffix: number;
  randomProperty: number;
  lock: number;
  maxDurability: number;
  durability: number;
};

export type TradeStatusExtended = {
  side: number;
  tradeId: number;
  gold: number;
  spell: number;
  items: readonly TradeExtendedItem[];
};

const TRADE_SLOT_COUNT = 7;

function readExtendedItem(
  reader: PacketReader,
  slot: number,
): TradeExtendedItem | undefined {
  if (reader.remaining < 72) return undefined;
  const entry = reader.uint32LE();
  const display = reader.uint32LE();
  const count = reader.uint32LE();
  const wrapped = reader.uint32LE();
  const giftCreator = reader.uint64LE();
  const permanentEnchant = reader.uint32LE();
  const gemEnchants = [
    reader.uint32LE(),
    reader.uint32LE(),
    reader.uint32LE(),
  ] as const;
  const creator = reader.uint64LE();
  const charges = reader.uint32LE();
  const suffix = reader.uint32LE();
  const randomProperty = reader.int32LE();
  const lock = reader.uint32LE();
  const maxDurability = reader.uint32LE();
  const durability = reader.uint32LE();
  if (
    entry === 0 &&
    display === 0 &&
    count === 0 &&
    wrapped === 0 &&
    giftCreator === 0n &&
    permanentEnchant === 0 &&
    gemEnchants[0] === 0 &&
    gemEnchants[1] === 0 &&
    gemEnchants[2] === 0 &&
    creator === 0n &&
    charges === 0 &&
    suffix === 0 &&
    randomProperty === 0 &&
    lock === 0 &&
    maxDurability === 0 &&
    durability === 0
  )
    return undefined;
  return {
    charges,
    count,
    creator,
    display,
    durability,
    entry,
    gemEnchants,
    giftCreator,
    lock,
    maxDurability,
    permanentEnchant,
    randomProperty,
    slot,
    suffix,
    wrapped: wrapped !== 0,
  };
}

export function parseTradeStatusExtended(
  reader: PacketReader,
): TradeStatusExtended | undefined {
  if (reader.remaining < 21) return undefined;
  const side = reader.uint8();
  const tradeId = reader.uint32LE();
  if (reader.uint32LE() !== TRADE_SLOT_COUNT) return undefined;
  if (reader.uint32LE() !== TRADE_SLOT_COUNT) return undefined;
  const gold = reader.uint32LE();
  const spell = reader.uint32LE();
  const items: TradeExtendedItem[] = [];
  for (let slot = 0; slot < TRADE_SLOT_COUNT; slot++) {
    if (reader.remaining < 73) return undefined;
    const index = reader.uint8();
    const item = readExtendedItem(reader, index);
    if (item) items.push(item);
  }
  return { gold, items, side, spell, tradeId };
}

export function buildSetTradeItem(
  tradeSlot: number,
  bag: number,
  slot: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint8(tradeSlot);
  w.uint8(bag);
  w.uint8(slot);
  return w.finish();
}

export function buildClearTradeItem(tradeSlot: number): Uint8Array {
  const w = new PacketWriter();
  w.uint8(tradeSlot);
  return w.finish();
}

export function buildSetTradeGold(copper: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(copper);
  return w.finish();
}

export function buildAcceptTrade(): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(1);
  return w.finish();
}

export function buildUnacceptTrade(): Uint8Array {
  return new PacketWriter().finish();
}
