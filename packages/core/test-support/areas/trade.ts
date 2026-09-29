import { areaRig } from "#test-support/area-rig";
import { PacketWriter } from "#wow/protocol/packet";

export const TRADE_STATUS = {
  BEGIN_TRADE: 1,
  BUSY: 0,
  CLOSE_WINDOW: 12,
  IGNORE_YOU: 14,
  NO_TARGET: 6,
  OPEN_WINDOW: 2,
  TARGET_TO_FAR: 10,
  TRADE_CANCELED: 3,
  TRIAL_ACCOUNT: 21,
  WRONG_FACTION: 11,
  WRONG_REALM: 22,
  YOU_DEAD: 17,
} as const;

export const TRADE_PARTNER = 0x00_00_00_00_00_00_0b_01n;
export const TRADE_SELF = 0x00_00_00_00_00_00_0a_01n;

export type TradeStatusExtra = {
  trader?: bigint;
  tradeId?: number;
  result?: number;
  isTarget?: boolean;
  limitItem?: number;
  slot?: number;
};

export function tradeStatusBody(
  status: number,
  extra: TradeStatusExtra = {},
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(status);
  if (status === TRADE_STATUS.BEGIN_TRADE) w.uint64LE(extra.trader ?? 0n);
  else if (status === TRADE_STATUS.OPEN_WINDOW) w.uint32LE(extra.tradeId ?? 0);
  else if (status === TRADE_STATUS.CLOSE_WINDOW) {
    w.uint32LE(extra.result ?? 0);
    w.uint8(extra.isTarget ? 1 : 0);
    w.uint32LE(extra.limitItem ?? 0);
  } else if (status === 22 || status === 23) w.uint8(extra.slot ?? 0);
  return w.finish();
}

export function tradeRig() {
  return areaRig("trade", { selfGuid: TRADE_SELF });
}
