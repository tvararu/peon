import { describe, expect, test } from "bun:test";
import {
  TRADE_PARTNER,
  TRADE_STATUS,
  tradeStatusBody,
} from "#test-support/areas/trade";
import { bytes } from "#test-support/hex";
import {
  buildBeginTrade,
  buildBusyTrade,
  buildCancelTrade,
  buildIgnoreTrade,
  buildInitiateTrade,
  parseTradeStatus,
  tradeStatusName,
} from "#wow/areas/trade/protocol";
import { PacketReader } from "#wow/protocol/packet";

describe("trade status names", () => {
  test("status 22 is wrong_realm (SharedDefines.h), not wowm's ONLY_CONJURED", () => {
    expect(tradeStatusName(22)).toBe("wrong_realm");
  });

  test("an unknown status gets a fallback name", () => {
    expect(tradeStatusName(255)).toBe("trade_status_255");
  });
});

describe("parseTradeStatus", () => {
  test("BEGIN_TRADE reads the u32 status and the u64 trader (TradeHandler.cpp:39-42)", () => {
    const parsed = parseTradeStatus(
      new PacketReader(
        tradeStatusBody(TRADE_STATUS.BEGIN_TRADE, { trader: TRADE_PARTNER }),
      ),
    );
    expect(parsed).toMatchObject({
      status: 1,
      statusName: "begin_trade",
    });
    if (parsed?.kind !== "trader") throw new Error("BEGIN_TRADE lost its guid");
    expect(parsed.trader).toBe(TRADE_PARTNER);
  });

  test("OPEN_WINDOW reads a u32 (TradeHandler.cpp:43-45); wowm's smsg_trade_status has no branch for it", () => {
    const parsed = parseTradeStatus(
      new PacketReader(
        tradeStatusBody(TRADE_STATUS.OPEN_WINDOW, { tradeId: 0 }),
      ),
    );
    expect(parsed).toMatchObject({
      status: 2,
      statusName: "open_window",
      tradeId: 0,
    });
    if (parsed?.kind !== "open_window")
      throw new Error("OPEN_WINDOW lost its trade id");
    expect(parsed.tradeId).toBe(0);
  });

  test("CLOSE_WINDOW reads the u32 result, u8 target flag and u32 limit item (TradeHandler.cpp:46-51)", () => {
    const parsed = parseTradeStatus(
      new PacketReader(
        tradeStatusBody(TRADE_STATUS.CLOSE_WINDOW, {
          isTarget: false,
          limitItem: 0,
          result: 0,
        }),
      ),
    );
    expect(parsed).toMatchObject({
      limitItem: 0,
      result: 0,
      status: 12,
      statusName: "close_window",
    });
  });

  test("status 22 reads a u8 slot (TradeHandler.cpp:52-55)", () => {
    const parsed = parseTradeStatus(
      new PacketReader(tradeStatusBody(TRADE_STATUS.WRONG_REALM, { slot: 4 })),
    );
    expect(parsed).toMatchObject({ slot: 4, status: 22 });
  });

  test("a bare status leaves no bytes", () => {
    const parsed = parseTradeStatus(
      new PacketReader(tradeStatusBody(TRADE_STATUS.NO_TARGET)),
    );
    expect(parsed).toMatchObject({
      status: 6,
      statusName: "no_target",
    });
  });

  test("each branch leaves 0 bytes", () => {
    const bodies = [
      tradeStatusBody(TRADE_STATUS.BEGIN_TRADE, { trader: TRADE_PARTNER }),
      tradeStatusBody(TRADE_STATUS.OPEN_WINDOW, {}),
      tradeStatusBody(TRADE_STATUS.CLOSE_WINDOW, {}),
      tradeStatusBody(TRADE_STATUS.WRONG_REALM, { slot: 4 }),
      tradeStatusBody(TRADE_STATUS.NO_TARGET, {}),
    ];
    for (const body of bodies) {
      const reader = new PacketReader(body);
      parseTradeStatus(reader);
      expect(reader.remaining).toBe(0);
    }
  });
});

describe("trade builders", () => {
  test("CMSG_INITIATE_TRADE writes the u64 guid the handler reads (TradeHandler.cpp:723-724)", () => {
    expect(buildInitiateTrade(TRADE_PARTNER)).toEqual(
      bytes("010b000000000000"),
    );
  });

  test("begin, busy, ignore and cancel write empty bodies (TradeHandler.cpp:683-719)", () => {
    expect(buildBeginTrade()).toEqual(bytes(""));
    expect(buildBusyTrade()).toEqual(bytes(""));
    expect(buildIgnoreTrade()).toEqual(bytes(""));
    expect(buildCancelTrade()).toEqual(bytes(""));
  });
});
