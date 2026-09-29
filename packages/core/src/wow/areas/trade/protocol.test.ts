import { describe, expect, test } from "bun:test";
import {
  TRADE_PARTNER,
  TRADE_STATUS,
  tradeStatusBody,
  tradeStatusExtendedBody,
} from "#test-support/areas/trade";
import { bytes } from "#test-support/hex";
import {
  buildAcceptTrade,
  buildBeginTrade,
  buildBusyTrade,
  buildCancelTrade,
  buildClearTradeItem,
  buildIgnoreTrade,
  buildInitiateTrade,
  buildSetTradeGold,
  buildSetTradeItem,
  buildUnacceptTrade,
  parseTradeStatus,
  parseTradeStatusExtended,
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

describe("parseTradeStatusExtended", () => {
  const linen = {
    count: 3,
    creator: 0x0a_01n,
    display: 1234,
    durability: 20,
    entry: 2589,
    gemEnchants: [7, 8, 9],
    giftCreator: 0x0b_01n,
    lock: 5,
    maxDurability: 25,
    permanentEnchant: 44,
    randomProperty: -12,
    suffix: 99,
    wrapped: true,
  } as const;

  test("reads the side, gold, spell and every field of a filled slot (TradeHandler.cpp:74-122)", () => {
    const reader = new PacketReader(
      tradeStatusExtendedBody({
        gold: 1234,
        side: 1,
        slots: { 2: { ...linen, charges: 4 } },
        spell: 13262,
      }),
    );
    const parsed = parseTradeStatusExtended(reader);
    expect(parsed).toMatchObject({ gold: 1234, side: 1, spell: 13262 });
    expect(parsed?.items).toEqual([
      {
        charges: 4,
        count: 3,
        creator: 0x0a_01n,
        display: 1234,
        durability: 20,
        entry: 2589,
        gemEnchants: [7, 8, 9],
        giftCreator: 0x0b_01n,
        lock: 5,
        maxDurability: 25,
        permanentEnchant: 44,
        randomProperty: -12,
        slot: 2,
        suffix: 99,
        wrapped: true,
      },
    ]);
    expect(reader.remaining).toBe(0);
  });

  test("an all-zero slot is empty and gives no item", () => {
    const reader = new PacketReader(
      tradeStatusExtendedBody({ gold: 0, side: 0 }),
    );
    const parsed = parseTradeStatusExtended(reader);
    expect(parsed).toMatchObject({ gold: 0, items: [], side: 0, spell: 0 });
    expect(reader.remaining).toBe(0);
  });

  test("keeps the slot index of each filled slot among empty ones", () => {
    const parsed = parseTradeStatusExtended(
      new PacketReader(
        tradeStatusExtendedBody({
          side: 1,
          slots: { 0: { entry: 10 }, 6: { entry: 20 } },
        }),
      ),
    );
    expect(parsed?.items.map((item) => [item.slot, item.entry])).toEqual([
      [0, 10],
      [6, 20],
    ]);
  });

  test("a body cut inside the slot loop gives undefined", () => {
    const body = tradeStatusExtendedBody({ side: 1 });
    expect(
      parseTradeStatusExtended(new PacketReader(body.slice(0, 100))),
    ).toBeUndefined();
  });
});

describe("trade offer builders", () => {
  test("CMSG_SET_TRADE_ITEM writes u8 trade slot, u8 bag, u8 slot (TradeHandler.cpp:877-879)", () => {
    expect(buildSetTradeItem(2, 255, 24)).toEqual(bytes("02ff18"));
  });

  test("CMSG_CLEAR_TRADE_ITEM writes one u8 (TradeHandler.cpp:935-947)", () => {
    expect(buildClearTradeItem(3)).toEqual(bytes("03"));
  });

  test("CMSG_SET_TRADE_GOLD writes one u32 of copper (TradeHandler.cpp:858-868)", () => {
    expect(buildSetTradeGold(10)).toEqual(bytes("0a000000"));
  });

  test("CMSG_UNACCEPT_TRADE is empty (TradeHandler.cpp:683-690)", () => {
    expect(buildUnacceptTrade()).toEqual(bytes(""));
  });

  test("CMSG_ACCEPT_TRADE writes u32 1; AzerothCore reads no body (TradeHandler.cpp:237) and wowm cmsg_accept_trade has one u32", () => {
    expect(buildAcceptTrade()).toEqual(bytes("01000000"));
  });
});
