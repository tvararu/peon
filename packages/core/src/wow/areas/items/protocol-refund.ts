import type { PacketReader } from "#wow/protocol/packet";
import { PacketWriter } from "#wow/protocol/packet";

export const REFUND_COST_SLOTS = 5;

export type RefundCost = { entry: number; count: number };

export type RefundInfoPacket = {
  itemGuid: bigint;
  money: number;
  honor: number;
  arena: number;
  costs: [RefundCost, RefundCost, RefundCost, RefundCost, RefundCost];
  delta: number;
};

export type RefundResultPacket = {
  itemGuid: bigint;
  result: number;
  money: number | undefined;
  honor: number | undefined;
  arena: number | undefined;
  costs:
    | [RefundCost, RefundCost, RefundCost, RefundCost, RefundCost]
    | undefined;
};

export const REFUND_ERROR = 10;

export function buildItemRefundInfo(itemGuid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(itemGuid);
  return w.finish();
}

export function buildItemRefund(itemGuid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(itemGuid);
  return w.finish();
}

function costs(r: PacketReader): RefundInfoPacket["costs"] {
  return [
    { entry: r.uint32LE(), count: r.uint32LE() },
    { entry: r.uint32LE(), count: r.uint32LE() },
    { entry: r.uint32LE(), count: r.uint32LE() },
    { entry: r.uint32LE(), count: r.uint32LE() },
    { entry: r.uint32LE(), count: r.uint32LE() },
  ];
}

export function parseRefundInfo(r: PacketReader): RefundInfoPacket {
  const itemGuid = r.uint64LE();
  const money = r.uint32LE();
  const honor = r.uint32LE();
  const arena = r.uint32LE();
  const offer = costs(r);
  r.uint32LE();
  const delta = r.uint32LE();
  return { itemGuid, money, honor, arena, costs: offer, delta };
}

export function parseRefundResult(r: PacketReader): RefundResultPacket {
  const itemGuid = r.uint64LE();
  const result = r.uint32LE();
  if (result !== 0)
    return {
      itemGuid,
      result,
      money: undefined,
      honor: undefined,
      arena: undefined,
      costs: undefined,
    };
  const money = r.uint32LE();
  const honor = r.uint32LE();
  const arena = r.uint32LE();
  return { itemGuid, result, money, honor, arena, costs: costs(r) };
}
