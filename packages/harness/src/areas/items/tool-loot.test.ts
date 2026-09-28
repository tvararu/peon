import { describe, expect, jest, test } from "bun:test";
import type { LootItem, RewardsEvent, RewardsOpenLoot } from "@peon/core";
import { gearSpec } from "#harness/areas/items/tool";
import { contentOf, toolCtx } from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type TestRuntime,
} from "#test-support/runtime-fixture";

const POUCH = 0x40_00_00_00_00_00_00_07n;

function offered(slot: number, itemId: number): LootItem {
  return {
    count: 1,
    displayId: 0,
    itemId,
    randomPropertyId: 0,
    randomSuffix: 0,
    slot,
    slotType: 0,
  };
}

function pouch(t: TestRuntime, items: LootItem[]): RewardsOpenLoot {
  const inventory = t.handle.getInventoryState();
  t.handle.getInventoryState = () => ({
    ...inventory,
    slots: [
      {
        bag: 255,
        guid: POUCH,
        item: { entry: 4496, guid: POUCH, name: "Pouch" },
        region: "backpack",
        slot: 27,
        status: "occupied",
      } as never,
    ],
  });
  const window: RewardsOpenLoot = {
    guid: POUCH,
    invalidatedReason: undefined,
    items,
    lootType: 2,
    money: 0,
    openedAt: 0,
    phase: "open",
  } as RewardsOpenLoot;
  type ItemsHandle = { act: Record<string, unknown> };
  const items_ = t.handle.items as unknown as ItemsHandle;
  items_.act = { ...items_.act };
  jest.spyOn(items_.act, "open").mockResolvedValue(window);
  jest.spyOn(t.handle, "takeLootMoney").mockReturnValue(undefined);
  jest.spyOn(t.handle, "releaseLoot").mockReturnValue(undefined);
  return window;
}

function emit(
  t: TestRuntime,
  window: RewardsOpenLoot,
  type: RewardsEvent["type"],
  itemId = 0,
): void {
  const rewards = t.handle.getRewardsState();
  const lastItemPush =
    type === "item_push"
      ? ({ count: 1, guid: 0n, itemId, observedAt: 0 } as never)
      : rewards.lastItemPush;
  t.handle.triggerRewardsEvent({
    at: 0,
    state: { ...rewards, lastItemPush, loot: window } as never,
    type,
  });
}

function removeSlot(window: RewardsOpenLoot, slot: number): void {
  const index = window.items.findIndex((item) => item.slot === slot);
  if (index >= 0) window.items.splice(index, 1);
}

function takeAsServer(t: TestRuntime, window: RewardsOpenLoot): string[] {
  const seen: string[] = [];
  jest.spyOn(t.handle, "takeLoot").mockImplementation((slot: number) => {
    seen.push(`take ${slot}`);
    const item = window.items.find((candidate) => candidate.slot === slot);
    if (!item) return;
    queueMicrotask(() => {
      removeSlot(window, slot);
      seen.push(`removed ${slot}`);
      emit(t, window, "loot_removed");
      queueMicrotask(() => {
        seen.push(`pushed ${item.itemId}`);
        emit(t, window, "item_push", item.itemId);
      });
    });
  });
  return seen;
}

describe("gear tool open", () => {
  test("takes every offered item while removals shrink the loot", async () => {
    const t = await createTestRuntime();
    const window = pouch(t, [offered(0, 7073), offered(1, 2589)]);
    const seen = takeAsServer(t, window);
    const res = await gearSpec.run({ do: "open", item: "Pouch" }, toolCtx(t));
    expect(seen.filter((line) => line.startsWith("take"))).toEqual([
      "take 0",
      "take 1",
    ]);
    expect(contentOf(res)).toMatch(
      /^DONE Opened Pouch: item 7073 x1, item 2589 x1\./,
    );
  });

  test("waits for the item push before it ends the collection", async () => {
    const t = await createTestRuntime();
    const window = pouch(t, [offered(0, 7073)]);
    const removed = Promise.withResolvers<void>();
    const release = jest.spyOn(t.handle, "releaseLoot");
    jest.spyOn(t.handle, "takeLoot").mockImplementation(() => {
      queueMicrotask(() => {
        removeSlot(window, 0);
        emit(t, window, "loot_removed");
        removed.resolve();
      });
    });
    const result = gearSpec.run({ do: "open", item: "Pouch" }, toolCtx(t));
    await removed.promise;
    for (let turn = 0; turn < 12; turn++) await Promise.resolve();
    const releasedBeforePush = release.mock.calls.length;
    emit(t, window, "item_push", 7073);
    const res = await result;
    expect(releasedBeforePush).toBe(0);
    expect(contentOf(res)).toMatch(/^DONE Opened Pouch: item 7073 x1\./);
  });

  test("waits for the removal of the slot it took", async () => {
    const t = await createTestRuntime();
    const window = pouch(t, [offered(0, 7073), offered(1, 2589)]);
    const otherRemoved = Promise.withResolvers<void>();
    const release = jest.spyOn(t.handle, "releaseLoot");
    const seen: string[] = [];
    jest.spyOn(t.handle, "takeLoot").mockImplementation((slot: number) => {
      seen.push(`take ${slot}`);
      if (slot !== 0) return;
      queueMicrotask(() => {
        removeSlot(window, 1);
        emit(t, window, "loot_removed");
        emit(t, window, "item_push", 7073);
        otherRemoved.resolve();
      });
    });
    const result = gearSpec.run({ do: "open", item: "Pouch" }, toolCtx(t));
    await otherRemoved.promise;
    for (let turn = 0; turn < 12; turn++) await Promise.resolve();
    const releasedBeforeRequestedSlot = release.mock.calls.length;
    removeSlot(window, 0);
    emit(t, window, "loot_removed");
    const res = await result;
    expect(releasedBeforeRequestedSlot).toBe(0);
    expect(seen).toEqual(["take 0"]);
    expect(contentOf(res)).toMatch(/^DONE Opened Pouch: item 7073 x1\./);
  });
});
