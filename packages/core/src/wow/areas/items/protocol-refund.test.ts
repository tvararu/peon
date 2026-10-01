import { describe, expect, test } from "bun:test";
import {
  itemsRefundInfoResponseBody,
  itemsRefundResultBody,
} from "#test-support/areas/items";
import { bytes } from "#test-support/hex";
import {
  buildItemRefund,
  buildItemRefundInfo,
  parseRefundInfo,
  parseRefundResult,
} from "#wow/areas/items/protocol-refund";
import { PacketReader } from "#wow/protocol/packet";

const ITEM = 0x40_00_00_00_00_00_12_34n;

describe("items refund packets", () => {
  test("CMSG_ITEM_REFUND_INFO is one u64 guid (ItemPackets.cpp:155-158)", () => {
    expect(buildItemRefundInfo(ITEM)).toEqual(bytes("3412000000000040"));
  });

  test("CMSG_ITEM_REFUND is one u64 guid (ItemPackets.cpp:160-163)", () => {
    expect(buildItemRefund(ITEM)).toEqual(bytes("3412000000000040"));
  });

  test("SMSG_ITEM_REFUND_INFO_RESPONSE is the offer plus a zero and the played-time delta (Player.cpp:15989-16001)", () => {
    const body = itemsRefundInfoResponseBody({
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
      itemGuid: ITEM,
      money: 12_345,
    });
    expect(body).toEqual(
      bytes(
        "3412000000000040 39300000 00000000 00000000 fa720000 05000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 100e0000",
      ),
    );
    const r = new PacketReader(body);
    expect(parseRefundInfo(r)).toEqual({
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
      itemGuid: ITEM,
      money: 12_345,
    });
    expect(r.remaining).toBe(0);
  });

  test("SMSG_ITEM_REFUND_RESULT success is the item, zero and the cost block (Player.cpp:16094-16104)", () => {
    const body = itemsRefundResultBody({
      arena: 0,
      costs: [
        { count: 5, entry: 29_434 },
        { count: 0, entry: 0 },
        { count: 0, entry: 0 },
        { count: 0, entry: 0 },
        { count: 0, entry: 0 },
      ],
      honor: 0,
      itemGuid: ITEM,
      money: 12_345,
      result: 0,
    });
    const r = new PacketReader(body);
    expect(parseRefundResult(r)).toEqual({
      arena: 0,
      costs: [
        { count: 5, entry: 29_434 },
        { count: 0, entry: 0 },
        { count: 0, entry: 0 },
        { count: 0, entry: 0 },
        { count: 0, entry: 0 },
      ],
      honor: 0,
      itemGuid: ITEM,
      money: 12_345,
      result: 0,
    });
    expect(r.remaining).toBe(0);
  });

  test("SMSG_ITEM_REFUND_RESULT error is the item and 10 with no cost block (Player.cpp:16046-16049)", () => {
    const body = itemsRefundResultBody({ itemGuid: ITEM, result: 10 });
    expect(body).toEqual(bytes("3412000000000040 0a000000"));
    const r = new PacketReader(body);
    expect(parseRefundResult(r)).toEqual({
      arena: undefined,
      costs: undefined,
      honor: undefined,
      itemGuid: ITEM,
      money: undefined,
      result: 10,
    });
    expect(r.remaining).toBe(0);
  });
});
