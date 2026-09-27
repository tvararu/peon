import { describe, expect, test } from "bun:test";
import type { NamedRewardsState } from "@peon/core";
import { lootCorpseOp } from "#harness/ops/loot";
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

  test("fallback before C7a: open, take after each push, money, release", async () => {
    const t = await createTestRuntime();
    const closed = t.handle.getRewardsState();
    const open = openWindow(t.handle);
    const sent: string[] = [];
    t.handle.lootCorpse = () => {
      throw new Error("not_implemented");
    };
    t.handle.openLoot = (guid) => {
      sent.push(`open ${guid.toString(16)}`);
      t.handle.getRewardsState = () => open;
      t.handle.triggerRewardsEvent({ at: 0, state: open, type: "loot_opened" });
    };
    t.handle.takeLoot = (slot) => {
      sent.push(`take ${slot}`);
      t.handle.triggerRewardsEvent({
        at: 0,
        state: { ...open, lastItemPush: push(7073, 1) },
        type: "item_push",
      });
    };
    t.handle.takeLootMoney = () => {
      sent.push("money");
      t.handle.triggerRewardsEvent({
        at: 0,
        state: {
          ...open,
          lastMoneyNotice: { alone: true, money: 12, observedAt: 0 },
        },
        type: "money_notice",
      });
    };
    t.handle.releaseLoot = () => {
      sent.push("release");
      t.handle.getRewardsState = () => closed;
      t.handle.triggerRewardsEvent({
        at: 0,
        state: closed,
        type: "loot_release_observed",
      });
    };
    const result = await lootCorpseOp(toolCtx(t), CORPSE);
    expect(sent).toEqual(["open 20", "take 0", "money", "release"]);
    expect(result.outcome).toMatchObject({
      ok: true,
      record: { moneyTaken: 12, slotsLeft: [], slotsTaken: [0] },
    });
    expect(result.items).toEqual([
      { count: 1, itemId: 7073, name: "Broken Fang", quality: 0 },
    ]);
    expect(result.copper).toBe(12);
  });

  test("fallback: a failed open stops with its cause and sends nothing else", async () => {
    const t = await createTestRuntime();
    const closed = t.handle.getRewardsState();
    t.handle.lootCorpse = () => {
      throw new Error("not_implemented");
    };
    t.handle.openLoot = () => {
      t.handle.triggerRewardsEvent({
        at: 0,
        state: closed,
        type: "loot_open_failed",
      });
    };
    let released = false;
    t.handle.releaseLoot = () => {
      released = true;
    };
    const result = await lootCorpseOp(toolCtx(t), CORPSE);
    expect(result.outcome).toEqual({ cause: "loot_open_failed", ok: false });
    expect(released).toBe(false);
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
    const result = await lootCorpseOp(toolCtx(t), CORPSE);
    expect(result.items).toEqual([
      { count: 1, itemId: 7073, name: "Broken Fang", quality: 0 },
    ]);
  });
});
