import { describe, expect, test } from "bun:test";
import type { VendorEvent } from "@peon/core";
import { createMockHandle } from "@peon/core/test-support/mock-handle";
import { routerSetup } from "#test-support/router-fixture";

const LATE_MS = 80;
const SETTLE_MS = 300;

function lateBagItem(handle: ReturnType<typeof createMockHandle>) {
  const inventory = handle.getInventoryState();
  let named = false;
  const slot = () => ({
    bag: 255,
    guid: 0x90n,
    item: {
      contained: undefined,
      count: 5,
      durability: undefined,
      entry: 159,
      flags: 0,
      guid: 0x90n,
      maxDurability: undefined,
      name: named ? "Refreshing Spring Water" : null,
      owner: undefined,
      quality: named ? 1 : null,
      randomPropertyId: 0,
    },
    region: "backpack" as const,
    slot: 23,
    status: "occupied" as const,
  });
  handle.getInventoryState = () => ({ ...inventory, slots: [slot()] });
  return () =>
    setTimeout(() => {
      named = true;
    }, LATE_MS);
}

function pushEvent(handle: ReturnType<typeof createMockHandle>) {
  const state = handle.getRewardsState();
  handle.triggerRewardsEvent({
    at: 0,
    state: {
      ...state,
      lastItemPush: {
        bagSlot: 255,
        count: 5,
        created: 0,
        guid: 1n,
        itemId: 159,
        observedAt: 0,
        randomPropertyId: 0,
        randomSuffix: 0,
        received: 1,
        showInChat: 1,
        slot: 23,
        totalCount: 5,
      },
    },
    type: "item_push",
  });
}

function listVendor(handle: ReturnType<typeof createMockHandle>) {
  const base = handle.getVendorState();
  let named = false;
  const good = {
    buyCount: 5,
    displayId: 0,
    extendedCost: 0,
    itemId: 159,
    maxDurability: 0,
    price: 25,
    slot: 1,
    stock: null,
  };
  const window = {
    emptyReason: undefined,
    guid: 0x10n,
    invalidatedReason: undefined,
    items: [good],
    openedAt: 0,
  };
  handle.getVendorState = () => ({
    ...base,
    window: {
      ...window,
      items: [
        named
          ? { ...good, name: "Refreshing Spring Water", quality: 1 }
          : { ...good, name: null, quality: null },
      ],
    },
  });
  const event: VendorEvent = {
    at: 0,
    state: { ...base, window },
    type: "listed",
  };
  handle.triggerVendorEvent(event);
  setTimeout(() => {
    named = true;
  }, LATE_MS);
}

const rows = (log: ReturnType<typeof routerSetup>["log"], event: string) =>
  log.since(0).filter((row) => row.event === event);

describe("router item names", () => {
  test("an item push row waits for a late name", async () => {
    const { log, router } = routerSetup();
    const handle = createMockHandle();
    router.attach(handle);
    const nameLater = lateBagItem(handle);
    pushEvent(handle);
    nameLater();
    expect(rows(log, "loot/item")).toHaveLength(0);
    await Bun.sleep(SETTLE_MS);
    expect(rows(log, "loot/item").map((row) => row.text)).toEqual([
      "You receive Refreshing Spring Water x5.",
    ]);
    expect(rows(log, "loot/item")[0]?.data).toMatchObject({
      name: "Refreshing Spring Water",
    });
  });

  test("a vendor list row waits for late names", async () => {
    const { log, router } = routerSetup();
    const handle = createMockHandle();
    router.attach(handle);
    listVendor(handle);
    expect(rows(log, "vendor/list")).toHaveLength(0);
    await Bun.sleep(SETTLE_MS);
    expect(rows(log, "vendor/list").map((row) => row.text)).toEqual([
      "The vendor lists 1 items: Refreshing Spring Water.",
    ]);
  });

  test("detach drops rows still waiting for names", async () => {
    const { log, router } = routerSetup();
    const handle = createMockHandle();
    const detach = router.attach(handle);
    const nameLater = lateBagItem(handle);
    pushEvent(handle);
    nameLater();
    detach();
    await Bun.sleep(SETTLE_MS);
    expect(rows(log, "loot/item")).toHaveLength(0);
  });
});
