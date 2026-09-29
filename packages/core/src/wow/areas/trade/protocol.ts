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
