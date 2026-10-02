import { describe, expect, test } from "bun:test";
import {
  AUCTION_BIDDER,
  AUCTION_OWNER,
  AUCTIONEER,
  auctionHelloBody,
  auctionListBody,
} from "#test-support/areas/auction";
import {
  AUCTION_BIDDER_LIST_LIMIT,
  buildAuctionHello,
  buildAuctionListBidderItems,
  buildAuctionListItems,
  buildAuctionListOwnerItems,
  parseAuctionHello,
  parseAuctionList,
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

  test("keeps duplicate ids in the bidder list", () => {
    const list = parseAuctionList(
      new PacketReader(auctionListBody({ rows: [{ id: 55 }, { id: 55 }] })),
    );
    expect(list.rows.map((row) => row.id)).toEqual([55, 55]);
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
