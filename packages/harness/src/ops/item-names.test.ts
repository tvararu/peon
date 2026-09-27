import { describe, expect, test } from "bun:test";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import {
  awaitItemNames,
  itemLabelIn,
  nameLootLines,
} from "#harness/ops/item-names";

function lateNames(afterMs: number, names: Record<number, string>) {
  let ready = false;
  setTimeout(() => {
    ready = true;
  }, afterMs);
  return (itemId: number) => (ready ? names[itemId] : undefined);
}

describe("awaitItemNames", () => {
  test("returns once every name has resolved", async () => {
    const nameOf = lateNames(60, { 117: "Tough Jerky" });
    const started = performance.now();
    await awaitItemNames([117], nameOf, { timeoutMs: 2000 });
    expect(nameOf(117)).toBe("Tough Jerky");
    expect(performance.now() - started).toBeLessThan(1000);
  });

  test("gives up after the bound", async () => {
    const started = performance.now();
    await awaitItemNames([117], () => undefined, { timeoutMs: 100 });
    expect(performance.now() - started).toBeGreaterThanOrEqual(90);
  });

  test("does not wait when nothing is pending", async () => {
    const started = performance.now();
    await awaitItemNames([117], () => "Tough Jerky", { timeoutMs: 2000 });
    expect(performance.now() - started).toBeLessThan(20);
  });

  test("stops when the signal aborts", async () => {
    const abort = new AbortController();
    setTimeout(() => abort.abort(new Error("stop")), 30);
    await expect(
      awaitItemNames([117], () => undefined, {
        signal: abort.signal,
        timeoutMs: 2000,
      }),
    ).rejects.toThrow("stop");
  });
});

describe("itemLabelIn", () => {
  test("reads names from the vendor window", () => {
    const handle = createMockHandle();
    const state = handle.getVendorState();
    handle.getVendorState = () => ({
      ...state,
      window: {
        emptyReason: undefined,
        guid: 1n,
        invalidatedReason: undefined,
        items: [
          {
            buyCount: 5,
            displayId: 0,
            extendedCost: 0,
            itemId: 159,
            maxDurability: 0,
            name: "Refreshing Spring Water",
            price: 25,
            quality: 1,
            slot: 1,
            stock: null,
          },
        ],
        openedAt: 0,
      },
    });
    expect(itemLabelIn(handle)(159)).toEqual({
      name: "Refreshing Spring Water",
      quality: 1,
    });
    expect(itemLabelIn(handle)(160)).toBeUndefined();
  });
});

describe("nameLootLines", () => {
  test("fills names and qualities that arrive late", async () => {
    const handle = createMockHandle();
    const inventory = handle.getInventoryState();
    let named = false;
    setTimeout(() => {
      named = true;
    }, 60);
    handle.getInventoryState = () => ({
      ...inventory,
      slots: [
        {
          bag: 255,
          guid: 0x90n,
          item: {
            contained: undefined,
            count: 2,
            durability: undefined,
            entry: 4813,
            flags: 0,
            guid: 0x90n,
            maxDurability: undefined,
            name: named ? "Small Leather Collar" : null,
            owner: undefined,
            quality: named ? 0 : null,
            randomPropertyId: 0,
          },
          region: "backpack",
          slot: 23,
          status: "occupied",
        },
      ],
    });
    const lines = await nameLootLines(
      { handle, signal: undefined },
      [{ count: 2, itemId: 4813, name: "item 4813", quality: null }],
      2000,
    );
    expect(lines).toEqual([
      { count: 2, itemId: 4813, name: "Small Leather Collar", quality: 0 },
    ]);
  });

  test("an aborted signal stops the wait and keeps the id names", async () => {
    const line = { count: 1, itemId: 5, name: "item 5", quality: null };
    const lines = await nameLootLines(
      {
        handle: createMockHandle(),
        signal: AbortSignal.abort(new Error("died")),
      },
      [line],
    );
    expect(lines).toEqual([line]);
  });
});
