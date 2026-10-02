import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import { fakeAwait, withFakeTimers } from "@peon/core/test-support/fake-time";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/auction-browse";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];

const AUCTIONEER = 0xf1_30_00_40_f3_00_29_42n;

function auctioneerRow(): Row {
  return {
    attackable: false,
    attackingMe: false,
    bearingRadians: null,
    distance: 2,
    entity: {
      entry: 16_627,
      guid: AUCTIONEER,
      name: "Ithillan",
      objectType: 3,
      position: { mapId: 530, orientation: 0, x: 0, y: 0, z: 0 },
      rawFields: new Map(),
      scale: 1,
    },
    horizontalDistance: 2,
    lootable: false,
    originSource: null,
    originUpdatedAt: null,
    position: { mapId: 530, orientation: 0, x: 0, y: 0, z: 0 },
    positionKind: null,
    positionObservedAt: null,
    positionSource: null,
    preparedAt: 0,
    relation: "friendly",
    remotePose: undefined,
    roles: ["auctioneer"],
    self: false,
    tapped: false,
    tappedByOther: false,
    targetOf: undefined,
    turnRadians: null,
  };
}

function context(args: Record<string, string>): FlowContext & {
  handle: MockHandle;
} {
  const handle = createMockHandle();
  handle.queryNearby = () => [auctioneerRow()];
  handle.walkTowardPoint = jest.fn(async () => ({
    pose: {
      mapId: 530,
      orientation: 0,
      source: "server" as const,
      updatedAt: 0,
      x: 0,
      y: 0,
      z: 0,
    },
    status: "completed" as const,
    traveled: 0,
  }));
  jest.spyOn(handle.auction, "state").mockReturnValue({
    bids: { rows: [], searchDelayMs: 300, total: 0 },
    house: { auctioneer: AUCTIONEER, houseId: 6 },
    lastOutcome: undefined,
    owned: { rows: [], searchDelayMs: 300, total: 0 },
    pending: undefined,
    search: {
      rows: [
        {
          bid: 0,
          bidder: 0n,
          buyout: 0,
          count: 1,
          enchants: [],
          entry: 2589,
          id: 101,
          minOutbid: 0,
          owner: 1n,
          randomProperty: 0,
          spellCharges: 0,
          startBid: 100,
          suffixFactor: 0,
          timeLeftMs: 1000,
        },
      ],
      searchDelayMs: 300,
      total: 1,
    },
    searchDelayMs: 300,
  });
  jest
    .spyOn(handle.auction.act, "openAuctionHouse")
    .mockResolvedValue({ status: "ok" });
  jest
    .spyOn(handle.auction.act, "searchAuctions")
    .mockResolvedValue({ status: "ok" });
  jest
    .spyOn(handle.auction.act, "listOwnAuctions")
    .mockResolvedValue({ status: "ok" });
  jest
    .spyOn(handle.auction.act, "listBids")
    .mockResolvedValue({ status: "ok" });
  return { args, handle, settle: settleWithin(200) };
}

describe("auction-browse flow", () => {
  test("opens the house, searches, and lists owned auctions and bids", async () => {
    const ctx = context({});
    const out = await flow.run(ctx);
    expect(ctx.handle.auction.act.openAuctionHouse).toHaveBeenCalledWith(
      AUCTIONEER,
    );
    expect(ctx.handle.auction.act.searchAuctions).toHaveBeenCalled();
    expect(ctx.handle.auction.act.listOwnAuctions).toHaveBeenCalledWith();
    expect(ctx.handle.auction.act.listBids).toHaveBeenCalledWith([]);
    expect(out).toMatchObject({
      bids: { status: "ok" },
      opened: { status: "ok" },
      owned: { status: "ok" },
      searched: { status: "ok" },
    });
  });

  test("passes the name and page filters to the search", async () => {
    const ctx = context({ from: "50", name: "linen" });
    await flow.run(ctx);
    expect(ctx.handle.auction.act.searchAuctions).toHaveBeenCalledWith({
      from: 50,
      itemClassFilter: 0xff_ff_ff_ff,
      name: "linen",
    });
  });

  test("no auctioneer in view throws", () =>
    withFakeTimers(async () => {
      const ctx = context({});
      ctx.handle.queryNearby = () => [];
      await expect(fakeAwait(flow.run(ctx), 1000)).rejects.toThrow(
        "no auctioneer is in view.",
      );
    }));
});
