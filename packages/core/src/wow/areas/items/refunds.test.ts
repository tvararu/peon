import { describe, expect, test } from "bun:test";
import type {
  RefundInfoPacket,
  RefundResultPacket,
} from "#wow/areas/items/protocol-refund";
import { RefundSlice } from "#wow/areas/items/refunds";

const ITEM = 0x40_00_00_00_00_00_12_34n;
const OTHER = 0x40_00_00_00_00_00_56_78n;

const offer = (itemGuid: bigint): RefundInfoPacket => ({
  arena: 0,
  costs: [
    { count: 5, entry: 29_434 },
    { count: 0, entry: 0 },
    { count: 0, entry: 0 },
    { count: 0, entry: 0 },
    { count: 0, entry: 0 },
  ],
  delta: 3600,
  honor: 0,
  itemGuid,
  money: 12_345,
});

const success = (itemGuid: bigint): RefundResultPacket => ({
  arena: 0,
  costs: [
    { count: 5, entry: 29_434 },
    { count: 0, entry: 0 },
    { count: 0, entry: 0 },
    { count: 0, entry: 0 },
    { count: 0, entry: 0 },
  ],
  honor: 0,
  itemGuid,
  money: 12_345,
  result: 0,
});

const failure = (itemGuid: bigint): RefundResultPacket => ({
  arena: undefined,
  costs: undefined,
  honor: undefined,
  itemGuid,
  money: undefined,
  result: 10,
});

describe("items refund slice", () => {
  test("an info reply for the asked item caches the offer by guid", () => {
    const slice = new RefundSlice();
    slice.beginInfo({ entry: 29_266, itemGuid: ITEM, requestedAt: 100 });
    const settled = slice.receiveInfo(offer(ITEM), 200);
    expect(settled?.info).toMatchObject({ itemGuid: ITEM, money: 12_345 });
    expect(slice.offer(ITEM)).toMatchObject({ delta: 3600 });
    expect(slice.snapshot().infoPending).toBeUndefined();
  });

  test("an info reply for another item leaves the pending query alone", () => {
    const slice = new RefundSlice();
    slice.beginInfo({ entry: 29_266, itemGuid: ITEM, requestedAt: 100 });
    expect(slice.receiveInfo(offer(OTHER), 200)).toBeUndefined();
    expect(slice.snapshot().infoPending).toMatchObject({ itemGuid: ITEM });
    expect(slice.offer(OTHER)).toMatchObject({ itemGuid: OTHER });
  });

  test("an unanswered info query settles none after the wait", () => {
    const slice = new RefundSlice();
    slice.beginInfo({ entry: 29_266, itemGuid: ITEM, requestedAt: 100 });
    const outcome = slice.expireInfo(5100);
    expect(outcome).toMatchObject({ info: undefined, status: "unanswered" });
    expect(slice.snapshot().infoPending).toBeUndefined();
  });

  test("a second info answer for a cached item replaces the cached offer", () => {
    const slice = new RefundSlice();
    slice.beginInfo({ entry: 29_266, itemGuid: ITEM, requestedAt: 100 });
    slice.receiveInfo(offer(ITEM), 200);
    slice.beginInfo({ entry: 29_266, itemGuid: ITEM, requestedAt: 300 });
    const next = { ...offer(ITEM), money: 999 };
    slice.receiveInfo(next, 400);
    expect(slice.offer(ITEM)).toMatchObject({ money: 999 });
  });

  test("a success result confirms the refund with the cost block", () => {
    const slice = new RefundSlice();
    slice.beginRefund({ entry: 29_266, itemGuid: ITEM, requestedAt: 100 });
    const outcome = slice.confirm(success(ITEM), 200);
    expect(outcome).toMatchObject({
      result: { money: 12_345, result: 0 },
      status: "confirmed",
    });
    expect(slice.snapshot().refundPending).toBeUndefined();
    expect(slice.snapshot().last).toMatchObject({ status: "confirmed" });
  });

  test("an error result refuses the refund", () => {
    const slice = new RefundSlice();
    slice.beginRefund({ entry: 29_266, itemGuid: ITEM, requestedAt: 100 });
    const outcome = slice.confirm(failure(ITEM), 200);
    expect(outcome).toMatchObject({
      reason: "refund_failed",
      status: "refused",
    });
  });

  test("a result for another item leaves the pending refund alone", () => {
    const slice = new RefundSlice();
    slice.beginRefund({ entry: 29_266, itemGuid: ITEM, requestedAt: 100 });
    expect(slice.confirm(success(OTHER), 200)).toBeUndefined();
    expect(slice.snapshot().refundPending).toMatchObject({ itemGuid: ITEM });
  });

  test("an unanswered refund settles unanswered after the wait", () => {
    const slice = new RefundSlice();
    slice.beginRefund({ entry: 29_266, itemGuid: ITEM, requestedAt: 100 });
    expect(slice.expireRefund(5100)).toMatchObject({ status: "unanswered" });
    expect(slice.snapshot().refundPending).toBeUndefined();
  });

  test("abandon drops both pendings and clear drops the cache", () => {
    const slice = new RefundSlice();
    slice.beginInfo({ entry: 29_266, itemGuid: ITEM, requestedAt: 100 });
    slice.beginRefund({ entry: 29_266, itemGuid: OTHER, requestedAt: 100 });
    slice.abandonInfo();
    slice.abandonRefund();
    expect(slice.snapshot().infoPending).toBeUndefined();
    expect(slice.snapshot().refundPending).toBeUndefined();
    slice.receiveInfo(offer(ITEM), 200);
    slice.clear();
    expect(slice.offer(ITEM)).toBeUndefined();
  });
});
