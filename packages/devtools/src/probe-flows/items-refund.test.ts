import { describe, expect, jest, test } from "bun:test";
import type { NamedVendorState, WorldHandle } from "@peon/core";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/items-refund";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];
type Inventory = ReturnType<WorldHandle["getInventoryState"]>;
const VENDOR = 0xf1_30_00_48_5d_00_12_60n;

const BOUGHT = 0x40_00_00_00_00_00_00_07n;
const BEYOND_SAFE = 0x40_00_00_00_00_00_00_42n;

function vendorRow(): Row {
  const position = { mapId: 530, orientation: 0, x: -1841, y: 5471, z: 1 };
  return {
    attackable: false,
    attackingMe: false,
    bearingRadians: null,
    distance: 1.5,
    entity: {
      class_: 1,
      displayId: 1,
      entry: 18_525,
      factionTemplate: 21,
      gender: 0,
      guid: VENDOR,
      health: 100,
      level: 70,
      maxHealth: 100,
      maxPower: [],
      name: "G'eras",
      npcFlags: 0,
      objectType: 3,
      position,
      power: [],
      race: 0,
      rawFields: new Map(),
      scale: 1,
      target: 0n,
      unitFlags: 0,
    },
    horizontalDistance: 1.5,
    lootable: false,
    originSource: null,
    originUpdatedAt: null,
    position,
    positionKind: null,
    positionObservedAt: null,
    positionSource: null,
    preparedAt: 0,
    relation: "friendly",
    remotePose: undefined,
    roles: ["vendor"],
    self: false,
    tapped: false,
    tappedByOther: false,
    targetOf: undefined,
    turnRadians: null,
  };
}

function inventory(occupiedAt24: boolean): Inventory {
  return {
    slots: [
      {
        bag: 255,
        guid: 0x40_00_00_00_00_00_00_01n,
        item: {
          entry: 25,
          guid: 0x40_00_00_00_00_00_00_01n,
        },
        region: "backpack",
        slot: 23,
        status: "occupied",
      },
      occupiedAt24
        ? {
            bag: 255,
            guid: BOUGHT,
            item: { entry: 99_999, guid: BOUGHT },
            region: "backpack",
            slot: 24,
            status: "occupied",
          }
        : { bag: 255, region: "backpack", slot: 24, status: "empty" },
    ],
    status: "complete",
  } as unknown as Inventory;
}

function window(): NamedVendorState["window"] {
  const label = { itemClass: 2, name: "Good", quality: 2, subclass: 0 };
  return {
    emptyReason: undefined,
    guid: VENDOR,
    invalidatedReason: undefined,
    items: [
      {
        ...label,
        buyCount: 1,
        displayId: 1,
        extendedCost: 0,
        itemId: 23_572,
        maxDurability: 0,
        price: 100,
        slot: 1,
        stock: null,
      },
      {
        ...label,
        buyCount: 1,
        displayId: 2,
        extendedCost: 312,
        itemId: 99_999,
        maxDurability: 0,
        price: 0,
        slot: 2,
        stock: null,
      },
    ],
    openedAt: 0,
  };
}

function context(args: Record<string, string>): FlowContext & {
  buy: ReturnType<typeof jest.fn>;
  handle: MockHandle;
} {
  const handle = createMockHandle();
  handle.queryNearby = () => [vendorRow()];
  handle.openVendor = jest.fn();
  handle.getInventoryState = jest.fn(() => inventory(false));
  const win = window();
  handle.getVendorState = jest.fn(() => ({ window: win }) as NamedVendorState);
  const buy = jest.fn(async () => {
    handle.getInventoryState = jest.fn(() => inventory(true));
    return { status: "ok" };
  });
  Object.assign(handle, {
    buyback: { ...handle.buyback, act: { buyInSlot: buy } },
  });
  return { args, buy, handle, settle: settleWithin(200) };
}

describe("items-refund flow", () => {
  test("do=buy buys the priced row and reports its guid plus priced rows", async () => {
    const ctx = context({ do: "buy", npc: "18525", slot: "2" });
    expect(await flow.run(ctx)).toMatchObject({
      bought: { status: "ok" },
      carried: `0x${BOUGHT.toString(16)}`,
      entry: 99_999,
      paid: [{ extendedCost: 312, itemId: 99_999, slot: 2 }],
      slot: 2,
    });
    expect(ctx.buy).toHaveBeenCalledWith({
      bag: 255,
      count: 1,
      slot: 24,
      vendorSlot: 2,
    });
  });

  test("do=buy takes the first vendor row when slot is missing", async () => {
    const ctx = context({ do: "buy", npc: "18525" });
    const result = (await flow.run(ctx)) as { entry: number; slot: number };
    expect(result.entry).toBe(23_572);
    expect(result.slot).toBe(1);
    expect(ctx.buy).toHaveBeenCalledWith({
      bag: 255,
      count: 1,
      slot: 24,
      vendorSlot: 1,
    });
  });

  test("do=info and do=refund pass the full guid, even beyond 2^53", async () => {
    const info = jest.fn(async () => ({ item: BEYOND_SAFE }));
    const refund = jest.fn(async () => ({ status: "confirmed" }));
    const acts = { refund, refundInfo: info };
    const hex = context({ do: "info", item: `0x${BEYOND_SAFE.toString(16)}` });
    Object.assign(hex.handle, { items: { act: acts } });
    await flow.run(hex);
    expect(info).toHaveBeenCalledWith(BEYOND_SAFE);
    const decimal = context({ do: "refund", item: `${BEYOND_SAFE}` });
    Object.assign(decimal.handle, { items: { act: acts } });
    await flow.run(decimal);
    expect(refund).toHaveBeenCalledWith(BEYOND_SAFE);
  });

  test("refuses an unknown do, a missing npc, a missing item and a bad guid", () => {
    expect(() => flow.run(context({ do: "sell" }))).toThrow("do=");
    expect(() => flow.run(context({ do: "buy" }))).toThrow("npc=");
    expect(() => flow.run(context({ do: "info" }))).toThrow("item=");
    expect(() => flow.run(context({ do: "info", item: "nope" }))).toThrow(
      "item=",
    );
  });
});
