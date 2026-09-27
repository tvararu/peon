import { describe, expect, test } from "bun:test";
import type { NamedRewardsState } from "@peon/core";
import { ITEM_NAME_WAIT_MS } from "#harness/ops/item-names";
import { lootCorpseOp } from "#harness/ops/loot";
import { fakeTimed } from "#test-support/fake-time";
import { toolCtx } from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

const CORPSE = 0x20n;

function push(itemId: number, count: number) {
  return {
    bagSlot: 255,
    count,
    created: 0,
    guid: 0n,
    itemId,
    observedAt: 0,
    randomPropertyId: 0,
    randomSuffix: 0,
    received: 1,
    showInChat: 1,
    slot: 0,
    totalCount: count,
  };
}

function openWindow(handle: MockHandle): NamedRewardsState {
  const base = handle.getRewardsState();
  return {
    ...base,
    loot: {
      guid: CORPSE,
      invalidatedReason: undefined,
      items: [
        {
          count: 1,
          displayId: 0,
          itemId: 7073,
          name: "Broken Fang",
          quality: 0,
          randomPropertyId: 0,
          randomSuffix: 0,
          slot: 0,
          slotType: 0,
        },
      ],
      lootType: 1,
      money: 12,
      openedAt: 0,
      phase: "open",
    },
  };
}

function fangItem() {
  return {
    count: 1,
    displayId: 0,
    itemId: 7073,
    name: "Broken Fang" as string | null,
    quality: 0 as number | null,
    randomPropertyId: 0,
    randomSuffix: 0,
    slot: 0,
    slotType: 0,
  };
}

function bagFang(named: boolean) {
  return {
    bag: 255,
    guid: 0x99n,
    item: {
      contained: undefined,
      count: 1,
      durability: undefined,
      entry: 7073,
      flags: 0,
      guid: 0x99n,
      maxDurability: undefined,
      name: named ? "Broken Fang" : null,
      owner: undefined,
      quality: named ? 0 : null,
      randomPropertyId: 0,
    },
    region: "backpack" as const,
    slot: 23,
    status: "occupied" as const,
  };
}

describe("lootCorpseOp", () => {
  test("core path: names from the window, counts from pushes, money from notices", async () => {
    const t = await createTestRuntime();
    const open = openWindow(t.handle);
    t.handle.lootCorpse = async () => {
      t.handle.getRewardsState = () => open;
      t.handle.triggerRewardsEvent({ at: 0, state: open, type: "loot_opened" });
      t.handle.triggerRewardsEvent({
        at: 0,
        state: { ...open, lastItemPush: push(7073, 1) },
        type: "item_push",
      });
      t.handle.triggerRewardsEvent({
        at: 0,
        state: {
          ...open,
          lastMoneyNotice: { alone: true, money: 12, observedAt: 0 },
        },
        type: "money_notice",
      });
      return {
        ok: true,
        record: {
          coinageAfter: 12,
          coinageBefore: 0,
          guid: "20",
          moneyTaken: 12,
          slotsLeft: [],
          slotsTaken: [0],
        },
      };
    };
    const result = await lootCorpseOp(toolCtx(t), CORPSE);
    expect(result.outcome.ok).toBe(true);
    expect(result.items).toEqual([
      { count: 1, itemId: 7073, name: "Broken Fang", quality: 0 },
    ]);
    expect(result.copper).toBe(12);
  });

  test("core path: names that arrive after the loot fill the lines", async () => {
    const t = await createTestRuntime();
    const open = openWindow(t.handle);
    const unnamed = {
      ...open,
      loot: {
        ...open.loot,
        items: [{ ...fangItem(), name: null, quality: null }],
      },
    };
    const inventory = t.handle.getInventoryState();
    let named = false;
    t.handle.getInventoryState = () => ({
      ...inventory,
      slots: [bagFang(named)],
    });
    t.handle.lootCorpse = async () => {
      t.handle.getRewardsState = () => unnamed;
      t.handle.triggerRewardsEvent({
        at: 0,
        state: unnamed,
        type: "loot_opened",
      });
      t.handle.triggerRewardsEvent({
        at: 0,
        state: { ...unnamed, lastItemPush: push(7073, 1) },
        type: "item_push",
      });
      setTimeout(() => {
        named = true;
      }, 80);
      return { ok: true, record: undefined };
    };
    const { run } = await fakeTimed(
      () => lootCorpseOp(toolCtx(t), CORPSE),
      ITEM_NAME_WAIT_MS,
    );
    const result = await run;
    expect(result.items).toEqual([
      { count: 1, itemId: 7073, name: "Broken Fang", quality: 0 },
    ]);
  });
});
