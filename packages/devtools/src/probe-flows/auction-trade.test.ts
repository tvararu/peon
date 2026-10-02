import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import { fakeAwait, withFakeTimers } from "@peon/core/test-support/fake-time";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/auction-trade";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];

const AUCTIONEER = 0xf1_30_00_40_f3_00_29_42n;
const OWNER = 0x00_00_00_00_00_00_00_2an;
const CLOTH = 0x40_00_00_00_00_00_00_31n;

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
  const inventory = {
    slots: [
      {
        bag: 255,
        guid: CLOTH,
        item: { entry: 2589 },
        region: "backpack",
        slot: 23,
        status: "occupied",
      },
    ],
  } as unknown as ReturnType<MockHandle["getInventoryState"]>;
  handle.getInventoryState = jest.fn(() => inventory);
  jest.spyOn(handle.auction.act, "openAuctionHouse").mockResolvedValue({
    status: "ok",
  });
  jest.spyOn(handle.auction.act, "postAuction").mockResolvedValue({
    auctionId: 42,
    status: "ok",
  });
  jest
    .spyOn(handle.auction.act, "searchAuctions")
    .mockResolvedValue({ status: "ok" });
  jest
    .spyOn(handle.auction.act, "listOwnAuctions")
    .mockResolvedValue({ status: "ok" });
  jest.spyOn(handle.auction.act, "cancelAuction").mockResolvedValue({
    auctionId: 7,
    status: "ok",
  });
  jest.spyOn(handle.auction.act, "bid").mockResolvedValue({
    auctionId: 11,
    status: "ok",
  });
  jest.spyOn(handle.auction.act, "listPendingSales").mockResolvedValue({
    count: 0,
    status: "ok",
  });
  return { args, handle, settle: settleWithin(200) };
}

function searchRow(handle: MockHandle, row: Record<string, number | bigint>) {
  jest.spyOn(handle.auction, "state").mockReturnValue({
    bids: undefined,
    house: { auctioneer: AUCTIONEER, houseId: 6 },
    lastOutcome: undefined,
    notices: undefined,
    owned: {
      rows: [
        {
          bid: 0,
          bidder: 0n,
          buyout: 0,
          count: 1,
          enchants: [],
          entry: 2589,
          id: 7,
          minOutbid: 0,
          owner: OWNER,
          randomProperty: 0,
          spellCharges: 0,
          startBid: 9000,
          suffixFactor: 0,
          timeLeftMs: 1000,
        },
      ],
      searchDelayMs: 300,
      total: 1,
    },
    pending: undefined,
    pendingCount: undefined,
    search: {
      rows: [
        {
          bid: 0,
          bidder: 0n,
          buyout: 10_000,
          count: 1,
          enchants: [],
          entry: 2589,
          id: 11,
          minOutbid: 0,
          owner: OWNER,
          randomProperty: 0,
          spellCharges: 0,
          startBid: 9000,
          suffixFactor: 0,
          timeLeftMs: 1000,
          ...row,
        },
      ],
      searchDelayMs: 300,
      total: 1,
    },
    searchDelayMs: 300,
  });
}

describe("auction-trade flow", () => {
  test("posts carried linen cloth for 12 hours", async () => {
    const ctx = context({ do: "post", item: "2589" });
    const out = await flow.run(ctx);
    expect(ctx.handle.auction.act.openAuctionHouse).toHaveBeenCalledWith(
      AUCTIONEER,
    );
    expect(ctx.handle.auction.act.postAuction).toHaveBeenCalledWith({
      bid: 9000,
      buyout: 10_000,
      count: 1,
      hours: 12,
      item: CLOTH,
    });
    expect(out).toMatchObject({ auctionId: 42, status: "ok" });
  });

  test("cancels only an auction on the own list", async () => {
    const ctx = context({ do: "cancel", id: "7" });
    searchRow(ctx.handle, {});
    const out = await flow.run(ctx);
    expect(ctx.handle.auction.act.cancelAuction).toHaveBeenCalledWith(7);
    expect(out).toMatchObject({ auctionId: 7, status: "ok" });
  });

  test("a cancel id missing from the own list sends nothing", async () => {
    const ctx = context({ do: "cancel", id: "99" });
    searchRow(ctx.handle, {});
    const out = await flow.run(ctx);
    expect(ctx.handle.auction.act.cancelAuction).not.toHaveBeenCalled();
    expect(out).toMatchObject({
      skipped: "auction 99 is not on the own list.",
    });
  });

  test("buys out only the row with the given owner", async () => {
    const ctx = context({
      do: "buyout",
      id: "11",
      owner: "0x000000000000002a",
    });
    searchRow(ctx.handle, {});
    await flow.run(ctx);
    expect(ctx.handle.auction.act.bid).toHaveBeenCalledWith(11, 10_000);
  });

  test("a wrong owner sends no bid", async () => {
    const ctx = context({ do: "buyout", id: "11", owner: "0x1" });
    searchRow(ctx.handle, {});
    const out = await flow.run(ctx);
    expect(ctx.handle.auction.act.bid).not.toHaveBeenCalled();
    expect(out).toMatchObject({
      skipped: "auction 11 is not owned by the given owner.",
    });
  });

  test("pending lists the pending sales", async () => {
    const ctx = context({ do: "pending" });
    const out = await flow.run(ctx);
    expect(ctx.handle.auction.act.listPendingSales).toHaveBeenCalledWith();
    expect(out).toMatchObject({ count: 0, status: "ok" });
  });

  test("no auctioneer in view throws", () =>
    withFakeTimers(async () => {
      const ctx = context({ do: "pending" });
      ctx.handle.queryNearby = () => [];
      await expect(fakeAwait(flow.run(ctx), 1000)).rejects.toThrow(
        "no auctioneer is in view.",
      );
    }));
});
