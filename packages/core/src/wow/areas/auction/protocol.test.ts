import { describe, expect, test } from "bun:test";
import {
  AUCTION_BIDDER,
  AUCTION_OWNER,
  AUCTION_SELF,
  AUCTIONEER,
  auctionBidderNoticeBody,
  auctionCommandResultBody,
  auctionHelloBody,
  auctionListBody,
  auctionOwnerNoticeBody,
} from "#test-support/areas/auction";
import {
  AUCTION_BIDDER_LIST_LIMIT,
  buildAuctionHello,
  buildAuctionListBidderItems,
  buildAuctionListItems,
  buildAuctionListOwnerItems,
  buildAuctionListPendingSales,
  buildAuctionPlaceBid,
  buildAuctionRemoveItem,
  buildAuctionSellItem,
  parseAuctionBidderNotice,
  parseAuctionCommandResult,
  parseAuctionHello,
  parseAuctionList,
  parseAuctionOwnerNotice,
} from "#wow/areas/auction/protocol";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

describe("parseAuctionHello", () => {
  test("reads the auctioneer guid, house id and enabled flag", () => {
    const hello = parseAuctionHello(new PacketReader(auctionHelloBody({})));
    expect(hello.auctioneer).toBe(AUCTIONEER);
    expect(hello.houseId).toBe(6);
    expect(hello.enabled).toBe(true);
  });

  test("a zero flag reads disabled", () => {
    const hello = parseAuctionHello(
      new PacketReader(auctionHelloBody({ enabled: false })),
    );
    expect(hello.enabled).toBe(false);
  });
});

describe("buildAuctionHello", () => {
  test("writes only the auctioneer guid", () => {
    const body = buildAuctionHello(AUCTIONEER);
    expect(body.byteLength).toBe(8);
    expect(new PacketReader(body).uint64LE()).toBe(AUCTIONEER);
  });
});

describe("parseAuctionList", () => {
  test("reads rows, the total and the search delay", () => {
    const list = parseAuctionList(
      new PacketReader(
        auctionListBody({
          delay: 300,
          rows: [
            {
              bid: 9500,
              bidder: AUCTION_BIDDER,
              buyout: 10_000,
              count: 2,
              entry: 2589,
              id: 101,
              minOutbid: 475,
              owner: AUCTION_OWNER,
              startBid: 9000,
              timeLeftMs: 43_200_000,
            },
          ],
          total: 27_451,
        }),
      ),
    );
    expect(list.rows.length).toBe(1);
    expect(list.total).toBe(27_451);
    expect(list.searchDelayMs).toBe(300);
    expect(list.rows[0]).toMatchObject({
      bid: 9500,
      bidder: AUCTION_BIDDER,
      buyout: 10_000,
      count: 2,
      entry: 2589,
      id: 101,
      minOutbid: 475,
      owner: AUCTION_OWNER,
      startBid: 9000,
      timeLeftMs: 43_200_000,
    });
  });

  test("an empty reply reads zero rows and zero total", () => {
    const list = parseAuctionList(new PacketReader(auctionListBody({})));
    expect(list.rows).toEqual([]);
    expect(list.total).toBe(0);
    expect(list.searchDelayMs).toBe(300);
  });

  test("a body whose length does not fit the count is refused", () => {
    const w = new PacketWriter();
    w.uint32LE(1);
    expect(() => parseAuctionList(new PacketReader(w.finish()))).toThrow();
  });
});

describe("buildAuctionListItems", () => {
  test("writes the live accepted any-query shape", () => {
    const body = buildAuctionListItems({
      from: 0,
      itemClassFilter: 0xff_ff_ff_ff,
      npc: AUCTIONEER,
      sort: [],
    });
    expect(body.byteLength).toBe(34);
    const reader = new PacketReader(body);
    expect(reader.uint64LE()).toBe(AUCTIONEER);
    expect(reader.uint32LE()).toBe(0);
    expect(reader.cString()).toBe("");
    expect(reader.uint8()).toBe(0);
    expect(reader.uint8()).toBe(0);
    expect(reader.uint32LE()).toBe(0xff_ff_ff_ff);
    expect(reader.uint32LE()).toBe(0xff_ff_ff_ff);
    expect(reader.uint32LE()).toBe(0xff_ff_ff_ff);
    expect(reader.uint32LE()).toBe(0xff_ff_ff_ff);
    expect(reader.uint8()).toBe(0);
    expect(reader.uint8()).toBe(0);
    expect(reader.uint8()).toBe(0);
  });

  test("writes a name query with paging and the sort list", () => {
    const body = buildAuctionListItems({
      from: 50,
      inventoryType: 0,
      itemClassFilter: 2,
      itemSubClass: 6,
      levelMax: 20,
      levelMin: 1,
      name: "linen",
      npc: AUCTIONEER,
      quality: 1,
      sort: [
        { isDesc: false, mode: 1 },
        { isDesc: true, mode: 0 },
      ],
      usable: false,
    });
    const reader = new PacketReader(body);
    expect(reader.uint64LE()).toBe(AUCTIONEER);
    expect(reader.uint32LE()).toBe(50);
    expect(reader.cString()).toBe("linen");
    expect(reader.uint8()).toBe(1);
    expect(reader.uint8()).toBe(20);
    expect(reader.uint32LE()).toBe(0);
    expect(reader.uint32LE()).toBe(2);
    expect(reader.uint32LE()).toBe(6);
    expect(reader.uint32LE()).toBe(1);
    expect(reader.uint8()).toBe(0);
    expect(reader.uint8()).toBe(0);
    expect(reader.uint8()).toBe(2);
    expect(reader.uint8()).toBe(1);
    expect(reader.uint8()).toBe(0);
    expect(reader.uint8()).toBe(0);
    expect(reader.uint8()).toBe(1);
  });

  test("a sort count over the server limit is refused locally", () => {
    const sort = Array.from({ length: 12 }, () => ({
      isDesc: false,
      mode: 0,
    }));
    expect(() =>
      buildAuctionListItems({
        from: 0,
        itemClassFilter: 0xff_ff_ff_ff,
        npc: AUCTIONEER,
        sort,
      }),
    ).toThrow();
  });
});

describe("buildAuctionListOwnerItems", () => {
  test("writes the guid and the page start", () => {
    const body = buildAuctionListOwnerItems(AUCTIONEER, 0);
    expect(body.byteLength).toBe(12);
    const reader = new PacketReader(body);
    expect(reader.uint64LE()).toBe(AUCTIONEER);
    expect(reader.uint32LE()).toBe(0);
  });
});

describe("buildAuctionListBidderItems", () => {
  test("writes exactly 16 + 4n bytes", () => {
    const body = buildAuctionListBidderItems(AUCTIONEER, 0, [7, 9]);
    expect(body.byteLength).toBe(16 + 8);
    const reader = new PacketReader(body);
    expect(reader.uint64LE()).toBe(AUCTIONEER);
    expect(reader.uint32LE()).toBe(0);
    expect(reader.uint32LE()).toBe(2);
    expect(reader.uint32LE()).toBe(7);
    expect(reader.uint32LE()).toBe(9);
  });

  test("more than a thousand ids are refused locally", () => {
    const ids = Array.from(
      { length: AUCTION_BIDDER_LIST_LIMIT + 1 },
      (_, index) => index + 1,
    );
    expect(() => buildAuctionListBidderItems(AUCTIONEER, 0, ids)).toThrow();
  });
});

describe("parseAuctionCommandResult", () => {
  test("reads id, action and error without the tail on a sell", () => {
    const result = parseAuctionCommandResult(
      new PacketReader(auctionCommandResultBody({ action: 0, auctionId: 42 })),
    );
    expect(result).toEqual({ action: 0, auctionId: 42, error: 0 });
  });

  test("reads the extra word only when error is 0 and action is not 0", () => {
    const cancel = parseAuctionCommandResult(
      new PacketReader(
        auctionCommandResultBody({ action: 1, auctionId: 7, bidError: 0 }),
      ),
    );
    expect(cancel).toEqual({ action: 1, auctionId: 7, bidError: 0, error: 0 });
    const error = parseAuctionCommandResult(
      new PacketReader(
        auctionCommandResultBody({ action: 2, auctionId: 0, error: 10 }),
      ),
    );
    expect(error).toEqual({ action: 2, auctionId: 0, error: 10 });
  });
});

describe("parseAuctionBidderNotice", () => {
  test("reads four words after the guid", () => {
    const notice = parseAuctionBidderNotice(
      new PacketReader(auctionBidderNoticeBody({ auctionId: 11, bidSum: 0 })),
    );
    expect(notice.auctionId).toBe(11);
    expect(notice.bidder).toBe(AUCTION_SELF);
    expect(notice.bidSum).toBe(0);
    expect(notice.itemEntry).toBe(2589);
  });
});

describe("parseAuctionOwnerNotice", () => {
  test("reads the auction id, the bid and the item entry", () => {
    const notice = parseAuctionOwnerNotice(
      new PacketReader(auctionOwnerNoticeBody({ auctionId: 9, bid: 9000 })),
    );
    expect(notice.auctionId).toBe(9);
    expect(notice.bid).toBe(9000);
    expect(notice.itemEntry).toBe(2589);
  });
});

describe("buildAuctionSellItem", () => {
  test("writes the auctioneer, one counted pair, bid, buyout and minutes", () => {
    const body = buildAuctionSellItem(AUCTIONEER, {
      bid: 9000,
      buyout: 10_000,
      items: [{ guid: AUCTIONEER, count: 2 }],
      minutes: 720,
    });
    expect(body.byteLength).toBe(8 + 4 + 12 + 12);
    const reader = new PacketReader(body);
    expect(reader.uint64LE()).toBe(AUCTIONEER);
    expect(reader.uint32LE()).toBe(1);
    expect(reader.uint64LE()).toBe(AUCTIONEER);
    expect(reader.uint32LE()).toBe(2);
    expect(reader.uint32LE()).toBe(9000);
    expect(reader.uint32LE()).toBe(10_000);
    expect(reader.uint32LE()).toBe(720);
  });
});

describe("buildAuctionRemoveItem and buildAuctionPlaceBid", () => {
  test("remove writes the auctioneer and the auction id", () => {
    const body = buildAuctionRemoveItem(AUCTIONEER, 7);
    expect(body.byteLength).toBe(12);
    const reader = new PacketReader(body);
    expect(reader.uint64LE()).toBe(AUCTIONEER);
    expect(reader.uint32LE()).toBe(7);
  });

  test("place bid writes the auctioneer, the auction id and the price", () => {
    const body = buildAuctionPlaceBid(AUCTIONEER, 7, 9000);
    expect(body.byteLength).toBe(16);
    const reader = new PacketReader(body);
    expect(reader.uint64LE()).toBe(AUCTIONEER);
    expect(reader.uint32LE()).toBe(7);
    expect(reader.uint32LE()).toBe(9000);
  });
});

describe("buildAuctionListPendingSales", () => {
  test("writes only the auctioneer guid", () => {
    const body = buildAuctionListPendingSales(AUCTIONEER);
    expect(body.byteLength).toBe(8);
    expect(new PacketReader(body).uint64LE()).toBe(AUCTIONEER);
  });
});
