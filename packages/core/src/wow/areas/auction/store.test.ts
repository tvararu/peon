import { describe, expect, test } from "bun:test";
import {
  AUCTIONEER,
  auctionBidderNoticeBody,
  auctionCommandResultBody,
  auctionHelloBody,
  auctionListBody,
  auctionOwnerNoticeBody,
  auctionPendingSalesBody,
  auctionRig,
} from "#test-support/areas/auction";
import { GameOpcode } from "#wow/protocol/opcodes";

describe("auction store", () => {
  test("a hello sets the house and emits house_opened", () => {
    const rig = auctionRig();
    try {
      const seen: string[] = [];
      rig.stores.areas.auction.onEvent((event) => {
        seen.push(event.type);
      });
      rig.inject(GameOpcode.MSG_AUCTION_HELLO, auctionHelloBody({}));
      expect(rig.stores.areas.auction.snapshot().house).toEqual({
        auctioneer: AUCTIONEER,
        houseId: 6,
      });
      expect(seen).toEqual(["house_opened"]);
    } finally {
      rig.dispose();
    }
  });

  test("a search reply sets search, total and delay and emits listed", () => {
    const rig = auctionRig();
    try {
      const seen: string[] = [];
      rig.stores.areas.auction.onEvent((event) => {
        if (event.type === "listed") seen.push(event.kind);
      });
      rig.inject(
        GameOpcode.SMSG_AUCTION_LIST_RESULT,
        auctionListBody({ rows: [{ id: 7 }], total: 100 }),
      );
      const state = rig.stores.areas.auction.snapshot();
      expect(state.search?.rows.map((row) => row.id)).toEqual([7]);
      expect(state.search?.total).toBe(100);
      expect(state.searchDelayMs).toBe(300);
      expect(seen).toEqual(["search"]);
    } finally {
      rig.dispose();
    }
  });

  test("an owner reply sets owned and a bidder reply sets bids", () => {
    const rig = auctionRig();
    try {
      rig.inject(
        GameOpcode.SMSG_AUCTION_OWNER_LIST_RESULT,
        auctionListBody({ rows: [{ id: 9 }] }),
      );
      rig.inject(
        GameOpcode.SMSG_AUCTION_BIDDER_LIST_RESULT,
        auctionListBody({ rows: [{ id: 9 }, { id: 9 }] }),
      );
      expect(
        rig.stores.areas.auction.snapshot().owned?.rows.map((row) => row.id),
      ).toEqual([9]);
      expect(
        rig.stores.areas.auction.snapshot().bids?.rows.map((row) => row.id),
      ).toEqual([9, 9]);
    } finally {
      rig.dispose();
    }
  });

  test("a second query does not clear the first list", () => {
    const rig = auctionRig();
    try {
      rig.inject(
        GameOpcode.SMSG_AUCTION_LIST_RESULT,
        auctionListBody({ rows: [{ id: 1 }] }),
      );
      rig.inject(
        GameOpcode.SMSG_AUCTION_OWNER_LIST_RESULT,
        auctionListBody({ rows: [{ id: 2 }] }),
      );
      expect(
        rig.stores.areas.auction.snapshot().search?.rows.map((row) => row.id),
      ).toEqual([1]);
      expect(
        rig.stores.areas.auction.snapshot().owned?.rows.map((row) => row.id),
      ).toEqual([2]);
    } finally {
      rig.dispose();
    }
  });

  test("a hello settles a pending quest talk with the auction window", () => {
    const rig = auctionRig();
    try {
      const seen: string[] = [];
      rig.stores.quests.onEvent((change) => {
        if (change.type === "window") seen.push(String(change.detail));
      });
      rig.stores.quests.requestIntent({ action: "talk", guid: AUCTIONEER });
      rig.inject(GameOpcode.MSG_AUCTION_HELLO, auctionHelloBody({}));
      expect(rig.stores.quests.snapshot().lastError).toBeUndefined();
      expect(rig.stores.quests.snapshot().pending).toBeUndefined();
      expect(seen).toEqual(["auction"]);
    } finally {
      rig.dispose();
    }
  });
  test("a sell result settles the matching command with the new auction id", () => {
    const rig = auctionRig();
    try {
      const seen: string[] = [];
      rig.stores.areas.auction.onEvent((event) => {
        seen.push(event.type);
      });
      rig.stores.areas.auction.begin({
        kind: "sell",
        npc: AUCTIONEER,
        requestedAt: 0,
      });
      rig.inject(
        GameOpcode.SMSG_AUCTION_COMMAND_RESULT,
        auctionCommandResultBody({ action: 0, auctionId: 42 }),
      );
      expect(rig.stores.areas.auction.snapshot().lastOutcome).toMatchObject({
        status: "ok",
      });
      expect(seen).toEqual(["command_result"]);
    } finally {
      rig.dispose();
    }
  });

  test("an error result settles the bid command as refused bid_own", () => {
    const rig = auctionRig();
    try {
      rig.stores.areas.auction.begin({
        id: 9,
        kind: "bid",
        npc: AUCTIONEER,
        price: 9000,
        requestedAt: 0,
      });
      rig.inject(
        GameOpcode.SMSG_AUCTION_COMMAND_RESULT,
        auctionCommandResultBody({ action: 2, auctionId: 0, error: 10 }),
      );
      expect(rig.stores.areas.auction.snapshot().lastOutcome).toMatchObject({
        status: "refused",
        why: "bid_own",
      });
    } finally {
      rig.dispose();
    }
  });

  test("a bidder notice with sum 0 wins and otherwise outbids", () => {
    const rig = auctionRig();
    try {
      const seen: string[] = [];
      rig.stores.areas.auction.onEvent((event) => {
        seen.push(event.type);
      });
      rig.inject(
        GameOpcode.SMSG_AUCTION_BIDDER_NOTIFICATION,
        auctionBidderNoticeBody({ auctionId: 11, bidSum: 0 }),
      );
      rig.inject(
        GameOpcode.SMSG_AUCTION_BIDDER_NOTIFICATION,
        auctionBidderNoticeBody({ auctionId: 12, bidSum: 9500, diff: 450 }),
      );
      expect(seen).toEqual(["won", "outbid"]);
      expect(
        rig.stores.areas.auction.snapshot().notices?.map((note) => note.kind),
      ).toEqual(["won", "outbid"]);
    } finally {
      rig.dispose();
    }
  });

  test("an owner notice records a sold auction", () => {
    const rig = auctionRig();
    try {
      rig.inject(
        GameOpcode.SMSG_AUCTION_OWNER_NOTIFICATION,
        auctionOwnerNoticeBody({ auctionId: 9, bid: 9000 }),
      );
      const notices = rig.stores.areas.auction.snapshot().notices ?? [];
      expect(notices.at(-1)).toMatchObject({ auctionId: 9, kind: "sold" });
    } finally {
      rig.dispose();
    }
  });

  test("notices keep only the newest twenty", () => {
    const rig = auctionRig();
    try {
      for (let id = 1; id <= 21; id++)
        rig.inject(
          GameOpcode.SMSG_AUCTION_OWNER_NOTIFICATION,
          auctionOwnerNoticeBody({ auctionId: id }),
        );
      const notices = rig.stores.areas.auction.snapshot().notices ?? [];
      expect(notices).toHaveLength(20);
      expect(notices[0]?.auctionId).toBe(2);
    } finally {
      rig.dispose();
    }
  });

  test("a pending sales reply records the count", () => {
    const rig = auctionRig();
    try {
      rig.stores.areas.auction.begin({
        kind: "pending",
        npc: AUCTIONEER,
        requestedAt: 0,
      });
      rig.inject(
        GameOpcode.SMSG_AUCTION_LIST_PENDING_SALES,
        auctionPendingSalesBody(0),
      );
      expect(rig.stores.areas.auction.snapshot().pendingCount).toBe(0);
    } finally {
      rig.dispose();
    }
  });
});
