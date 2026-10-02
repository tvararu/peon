import { describe, expect, test } from "bun:test";
import type { AreaRig } from "#test-support/area-rig";
import {
  AUCTION_OWNER,
  AUCTION_SELF,
  AUCTIONEER,
  auctionCommandResultBody,
  auctionHelloBody,
  auctionListBody,
  auctionNpc,
  auctionPendingSalesBody,
  auctionRig,
} from "#test-support/areas/auction";
import { itemsWorld } from "#test-support/areas/items-world";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import {
  buildAuctionHello,
  buildAuctionSellItem,
} from "#wow/areas/auction/protocol";
import { AUCTION_ANSWER_MS } from "#wow/areas/auction/commands";
import { auctioneerKind } from "#wow/areas/auction/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import { ITEM_FIELDS } from "#wow/protocol/update-fields";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function breakAuctionSend(rig: { sent: readonly unknown[] }): () => void {
  const sent = rig.sent as unknown as {
    push: (...items: never[]) => number;
  };
  const original = sent.push;
  sent.push = () => {
    throw new Error("world socket is not connected");
  };
  return () => {
    sent.push = original;
  };
}

describe("auctioneerKind", () => {
  test("a unit with the auctioneer flag is recognised", () => {
    expect(
      auctioneerKind(
        auctionNpc({ mapId: 530, orientation: 0, x: 0, y: 0, z: 0 }),
      ),
    ).toBe("auctioneer");
  });

  test("a unit without the flag is rejected", () => {
    expect(
      auctioneerKind(
        auctionNpc({ mapId: 530, orientation: 0, x: 0, y: 0, z: 0 }, 0),
      ),
    ).toBeUndefined();
  });
});

describe("auction acts", () => {
  test("openAuctionHouse refuses a distant auctioneer without sending", async () => {
    const rig = auctionRig({ npcDistance: 50 });
    try {
      await expect(rig.handle.act.openAuctionHouse(AUCTIONEER)).rejects.toThrow(
        "no auctioneer in range",
      );
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("openAuctionHouse sends the hello and settles ok", async () => {
    const rig = auctionRig();
    try {
      const pending = rig.handle.act.openAuctionHouse(AUCTIONEER);
      await flush();
      expect(rig.sent).toEqual([
        {
          body: buildAuctionHello(AUCTIONEER),
          opcode: GameOpcode.MSG_AUCTION_HELLO,
        },
      ]);
      rig.inject(GameOpcode.MSG_AUCTION_HELLO, auctionHelloBody({}));
      expect(await pending).toEqual({ status: "ok" });
      expect(rig.handle.state().house?.houseId).toBe(6);
    } finally {
      rig.dispose();
    }
  });

  test("searchAuctions pages from 50 and settles ok on the list", async () => {
    const rig = auctionRig();
    try {
      const opened = rig.handle.act.openAuctionHouse(AUCTIONEER);
      await flush();
      rig.inject(GameOpcode.MSG_AUCTION_HELLO, auctionHelloBody({}));
      await opened;
      const pending = rig.handle.act.searchAuctions({
        itemClassFilter: 0xff_ff_ff_ff,
        name: "linen",
      });
      await flush();
      expect(rig.sent.at(-1)?.opcode).toBe(GameOpcode.CMSG_AUCTION_LIST_ITEMS);
      rig.inject(
        GameOpcode.SMSG_AUCTION_LIST_RESULT,
        auctionListBody({ rows: [{ entry: 2589, id: 101 }], total: 5 }),
      );
      expect(await pending).toEqual({ status: "ok" });
      expect(rig.handle.state().search?.rows[0]?.entry).toBe(2589);
      const pageTwo = rig.handle.act.searchAuctions({
        from: 50,
        itemClassFilter: 0xff_ff_ff_ff,
      });
      await flush();
      rig.inject(
        GameOpcode.SMSG_AUCTION_LIST_RESULT,
        auctionListBody({ rows: [], total: 5 }),
      );
      expect(await pageTwo).toEqual({ status: "ok" });
      expect(rig.handle.state().search?.rows).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("listOwnAuctions and listBids settle ok on their replies", async () => {
    const rig = auctionRig();
    try {
      const opened = rig.handle.act.openAuctionHouse(AUCTIONEER);
      await flush();
      rig.inject(GameOpcode.MSG_AUCTION_HELLO, auctionHelloBody({}));
      await opened;
      const owned = rig.handle.act.listOwnAuctions();
      await flush();
      expect(rig.sent.at(-1)?.opcode).toBe(
        GameOpcode.CMSG_AUCTION_LIST_OWNER_ITEMS,
      );
      rig.inject(
        GameOpcode.SMSG_AUCTION_OWNER_LIST_RESULT,
        auctionListBody({ rows: [{ id: 11, owner: AUCTION_OWNER }] }),
      );
      expect(await owned).toEqual({ status: "ok" });
      expect(rig.handle.state().owned?.rows[0]?.id).toBe(11);
      const bids = rig.handle.act.listBids([]);
      await flush();
      expect(rig.sent.at(-1)?.opcode).toBe(
        GameOpcode.CMSG_AUCTION_LIST_BIDDER_ITEMS,
      );
      rig.inject(
        GameOpcode.SMSG_AUCTION_BIDDER_LIST_RESULT,
        auctionListBody({}),
      );
      expect(await bids).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("a list without an open house refuses before sending", async () => {
    const rig = auctionRig();
    try {
      await expect(
        rig.handle.act.searchAuctions({ itemClassFilter: 2 }),
      ).rejects.toThrow("no auction house is open");
      await expect(rig.handle.act.listOwnAuctions()).rejects.toThrow(
        "no auction house is open",
      );
      await expect(rig.handle.act.listBids([])).rejects.toThrow(
        "no auction house is open",
      );
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a search settles unanswered after 10 s of silence", async () => {
    await withFakeTimers(async () => {
      const rig = auctionRig();
      try {
        const opened = rig.handle.act.openAuctionHouse(AUCTIONEER);
        await elapse(0);
        rig.inject(GameOpcode.MSG_AUCTION_HELLO, auctionHelloBody({}));
        await opened;
        const pending = rig.handle.act.searchAuctions({
          itemClassFilter: 0xff_ff_ff_ff,
        });
        await elapse(10_000);
        expect(await pending).toEqual({ status: "unanswered" });
      } finally {
        rig.dispose();
      }
    });
  });

  test("run abort rejects a pending search", async () => {
    const rig = auctionRig();
    try {
      const opened = rig.handle.act.openAuctionHouse(AUCTIONEER);
      await flush();
      rig.inject(GameOpcode.MSG_AUCTION_HELLO, auctionHelloBody({}));
      await opened;
      const pending = rig.handle.act.searchAuctions({
        itemClassFilter: 0xff_ff_ff_ff,
      });
      await flush();
      rig.dispose();
      await expect(pending).rejects.toThrow();
    } finally {
      rig.dispose();
    }
  });

  test("openAuctionHouse rethrows a send failure and leaks no rejection", async () => {
    await withFakeTimers(async () => {
      const unhandled: unknown[] = [];
      const listener = (reason: unknown) => unhandled.push(reason);
      process.on("unhandledRejection", listener);
      const rig = auctionRig();
      const restore = breakAuctionSend(rig);
      try {
        const failed = rig.handle.act.openAuctionHouse(AUCTIONEER);
        await expect(failed).rejects.toThrow("world socket is not connected");
        await elapse(AUCTION_ANSWER_MS + 100);
        await Promise.resolve();
        expect(unhandled).toEqual([]);
      } finally {
        restore();
        process.off("unhandledRejection", listener);
        rig.dispose();
      }
    });
  });
});

const CLOTH = 0x40_00_00_00_00_00_00_31n;
const BAG = 0x40_00_00_00_00_00_00_32n;

function sentOpcodes(rig: AreaRig<"auction">): number[] {
  return rig.sent.map((packet) => packet.opcode);
}

async function openHouse(rig: AreaRig<"auction">): Promise<void> {
  const opened = rig.handle.act.openAuctionHouse(AUCTIONEER);
  await flush();
  rig.inject(GameOpcode.MSG_AUCTION_HELLO, auctionHelloBody({}));
  await opened;
}

describe("postAuction", () => {
  test("hours outside 12, 24 and 48 are refused before sending", async () => {
    const rig = auctionRig();
    try {
      await openHouse(rig);
      await expect(
        rig.handle.act.postAuction({
          bid: 9000,
          buyout: 10_000,
          count: 2,
          hours: 25,
          item: CLOTH,
        }),
      ).rejects.toThrow();
      expect(
        sentOpcodes(rig).filter(
          (opcode) => opcode === GameOpcode.CMSG_AUCTION_SELL_ITEM,
        ),
      ).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a zero bid is refused before sending", async () => {
    const rig = auctionRig();
    try {
      await openHouse(rig);
      await expect(
        rig.handle.act.postAuction({
          bid: 0,
          buyout: 10_000,
          count: 1,
          hours: 12,
          item: CLOTH,
        }),
      ).rejects.toThrow();
    } finally {
      rig.dispose();
    }
  });

  test("posts the chosen stack in minutes and settles on action 0", async () => {
    const world = itemsWorld(AUCTION_SELF);
    world.put(255, 23, { count: 2, entry: 2589, guid: CLOTH });
    const rig = auctionRig({ world });
    try {
      await openHouse(rig);
      const posted = rig.handle.act.postAuction({
        bid: 9000,
        buyout: 10_000,
        count: 2,
        hours: 12,
        item: CLOTH,
      });
      await flush();
      expect(rig.sent.at(-1)).toEqual({
        body: buildAuctionSellItem(AUCTIONEER, {
          bid: 9000,
          buyout: 10_000,
          items: [{ count: 2, guid: CLOTH }],
          minutes: 720,
        }),
        opcode: GameOpcode.CMSG_AUCTION_SELL_ITEM,
      });
      rig.inject(
        GameOpcode.SMSG_AUCTION_COMMAND_RESULT,
        auctionCommandResultBody({ action: 0, auctionId: 42 }),
      );
      expect(await posted).toEqual({ auctionId: 42, status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("an item missing from the bags is refused", async () => {
    const world = itemsWorld(AUCTION_SELF);
    const rig = auctionRig({ world });
    try {
      await openHouse(rig);
      await expect(
        rig.handle.act.postAuction({
          bid: 9000,
          buyout: 10_000,
          count: 1,
          hours: 12,
          item: CLOTH,
        }),
      ).rejects.toThrow("item_not_found");
      expect(sentOpcodes(rig)).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("a soulbound item is refused", async () => {
    const world = itemsWorld(AUCTION_SELF);
    const soul = world.put(255, 23, { count: 1, entry: 2589, guid: CLOTH });
    (soul.rawFields as Map<number, number>).set(ITEM_FIELDS.FLAGS.offset, 1);
    const rig = auctionRig({ world });
    try {
      await openHouse(rig);
      await expect(
        rig.handle.act.postAuction({
          bid: 9000,
          buyout: 10_000,
          count: 1,
          hours: 12,
          item: CLOTH,
        }),
      ).rejects.toThrow("not_tradeable");
    } finally {
      rig.dispose();
    }
  });

  test("a count above the stack is refused", async () => {
    const world = itemsWorld(AUCTION_SELF);
    world.put(255, 23, { count: 2, entry: 2589, guid: CLOTH });
    const rig = auctionRig({ world });
    try {
      await openHouse(rig);
      await expect(
        rig.handle.act.postAuction({
          bid: 9000,
          buyout: 10_000,
          count: 3,
          hours: 12,
          item: CLOTH,
        }),
      ).rejects.toThrow("count_too_large");
    } finally {
      rig.dispose();
    }
  });

  test("a non-empty equipped bag is refused", async () => {
    const world = itemsWorld(AUCTION_SELF);
    world.put(255, 19, { bagSlots: 4, entry: 4496, guid: BAG });
    world.put(19, 0, { count: 1, entry: 2589, guid: CLOTH });
    const rig = auctionRig({ world });
    try {
      await openHouse(rig);
      await expect(
        rig.handle.act.postAuction({
          bid: 9000,
          buyout: 10_000,
          count: 1,
          hours: 12,
          item: BAG,
        }),
      ).rejects.toThrow("bag_not_empty");
    } finally {
      rig.dispose();
    }
  });
});

describe("cancelAuction", () => {
  test("cancels by id and settles on the action 1 tail", async () => {
    const rig = auctionRig();
    try {
      await openHouse(rig);
      const cancelled = rig.handle.act.cancelAuction(7);
      await flush();
      expect(rig.sent.at(-1)?.opcode).toBe(GameOpcode.CMSG_AUCTION_REMOVE_ITEM);
      rig.inject(
        GameOpcode.SMSG_AUCTION_COMMAND_RESULT,
        auctionCommandResultBody({ action: 1, auctionId: 7, bidError: 0 }),
      );
      expect(await cancelled).toEqual({
        auctionId: 7,
        bidError: 0,
        status: "ok",
      });
    } finally {
      rig.dispose();
    }
  });
});

describe("bid", () => {
  test("a price below the listed minimum is refused before sending", async () => {
    const rig = auctionRig();
    try {
      await openHouse(rig);
      rig.inject(
        GameOpcode.SMSG_AUCTION_LIST_RESULT,
        auctionListBody({
          rows: [{ bid: 9000, buyout: 10_000, id: 11, startBid: 8000 }],
          total: 1,
        }),
      );
      await expect(rig.handle.act.bid(11, 9000)).rejects.toThrow("bid_too_low");
      expect(
        sentOpcodes(rig).filter(
          (opcode) => opcode === GameOpcode.CMSG_AUCTION_PLACE_BID,
        ),
      ).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a bid settles ok on action 2 and own auctions refuse bid_own", async () => {
    const rig = auctionRig();
    try {
      await openHouse(rig);
      rig.inject(
        GameOpcode.SMSG_AUCTION_LIST_RESULT,
        auctionListBody({
          rows: [
            { bid: 0, buyout: 10_000, id: 11, minOutbid: 0, startBid: 9000 },
          ],
          total: 1,
        }),
      );
      const placed = rig.handle.act.bid(11, 9000);
      await flush();
      expect(rig.sent.at(-1)?.opcode).toBe(GameOpcode.CMSG_AUCTION_PLACE_BID);
      rig.inject(
        GameOpcode.SMSG_AUCTION_COMMAND_RESULT,
        auctionCommandResultBody({ action: 2, auctionId: 11, bidError: 0 }),
      );
      expect(await placed).toEqual({
        auctionId: 11,
        bidError: 0,
        status: "ok",
      });
      const own = rig.handle.act.bid(11, 9500);
      await flush();
      rig.inject(
        GameOpcode.SMSG_AUCTION_COMMAND_RESULT,
        auctionCommandResultBody({ action: 2, auctionId: 0, error: 10 }),
      );
      expect(await own).toEqual({ status: "refused", why: "bid_own" });
    } finally {
      rig.dispose();
    }
  });
});

describe("listPendingSales", () => {
  test("sends anywhere and settles on the reply", async () => {
    const rig = auctionRig();
    try {
      const pending = rig.handle.act.listPendingSales();
      await flush();
      expect(rig.sent.at(-1)?.opcode).toBe(
        GameOpcode.CMSG_AUCTION_LIST_PENDING_SALES,
      );
      rig.inject(
        GameOpcode.SMSG_AUCTION_LIST_PENDING_SALES,
        auctionPendingSalesBody(0),
      );
      expect(await pending).toEqual({ count: 0, status: "ok" });
      expect(rig.handle.state().pendingCount).toBe(0);
    } finally {
      rig.dispose();
    }
  });
});
