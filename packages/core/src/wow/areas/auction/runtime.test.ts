import { describe, expect, test } from "bun:test";
import {
  AUCTION_OWNER,
  AUCTIONEER,
  auctionHelloBody,
  auctionListBody,
  auctionNpc,
  auctionRig,
} from "#test-support/areas/auction";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import { buildAuctionHello } from "#wow/areas/auction/protocol";
import { AUCTION_ANSWER_MS } from "#wow/areas/auction/runtime";
import { auctioneerKind } from "#wow/areas/auction/store";
import { GameOpcode } from "#wow/protocol/opcodes";

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
