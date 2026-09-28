import { describe, expect, jest, test } from "bun:test";
import {
  BREAD_ENTRY,
  BUYBACK_BREAD,
  BUYBACK_VENDOR,
  buybackBuyFailedBody,
  buybackClear,
  buybackCoinage,
  buybackOpenVendor,
  buybackScene,
  buybackSellBread,
  buybackSellItemBody,
} from "#test-support/areas/buyback";
import { itemsInventoryChangeFailureBody } from "#test-support/areas/items";
import { buildBuybackItem } from "#wow/areas/buyback/protocol";
import type { BuybackEvent } from "#wow/areas/buyback/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const OTHER = 0x40_00_00_00_00_00_00_99n;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function soldScene() {
  const scene = buybackScene();
  buybackSellBread(scene);
  buybackOpenVendor(scene.rig);
  return scene;
}

function legacy(scene: ReturnType<typeof soldScene>) {
  const { pending, lastOutcome } = scene.rig.stores.vendor.snapshot();
  return { lastOutcome, pending };
}

describe("buyback act", () => {
  test("sends CMSG_BUYBACK_ITEM and settles ok when slot 74 empties and the bag gains the item", async () => {
    const scene = soldScene();
    const { rig, world } = scene;
    const events: BuybackEvent[] = [];
    rig.handle.onEvent((event) => events.push(event));
    try {
      const pending = rig.handle.act.buyback(74);
      await flush();
      expect(rig.sent).toEqual([
        {
          body: buildBuybackItem(BUYBACK_VENDOR, 74),
          opcode: GameOpcode.CMSG_BUYBACK_ITEM,
        },
      ]);
      expect(rig.handle.state().pending).toMatchObject({
        entry: BREAD_ENTRY,
        kind: "buyback",
        slot: 74,
      });
      buybackClear(world, 74);
      world.put(255, 30, { count: 2, entry: BREAD_ENTRY, guid: BUYBACK_BREAD });
      buybackCoinage(world, 1000);
      rig.touch();
      expect(await pending).toMatchObject({ status: "ok" });
      expect(rig.handle.state().pending).toBeUndefined();
      expect(events.map((event) => event.type)).toContain("bought_back");
      expect(legacy(scene)).toEqual({
        lastOutcome: undefined,
        pending: undefined,
      });
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_BUY_FAILED with the item entry settles refused not_enough_money (ItemHandler.cpp:766-769)", async () => {
    const scene = soldScene();
    const { rig } = scene;
    try {
      const pending = rig.handle.act.buyback(74);
      await flush();
      rig.inject(
        GameOpcode.SMSG_BUY_FAILED,
        buybackBuyFailedBody({
          itemId: BREAD_ENTRY,
          result: 2,
          vendor: BUYBACK_VENDOR,
        }),
      );
      expect(await pending).toMatchObject({
        reason: "not_enough_money",
        status: "refused",
      });
      expect(legacy(scene)).toEqual({
        lastOutcome: undefined,
        pending: undefined,
      });
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_BUY_FAILED with item 0 settles refused cant_find_item (ItemHandler.cpp:795)", async () => {
    const { rig } = soldScene();
    try {
      const pending = rig.handle.act.buyback(74);
      await flush();
      rig.inject(
        GameOpcode.SMSG_BUY_FAILED,
        buybackBuyFailedBody({ itemId: 0, result: 0, vendor: BUYBACK_VENDOR }),
      );
      expect(await pending).toMatchObject({
        reason: "cant_find_item",
        status: "refused",
      });
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_SELL_ITEM with cant_find_vendor settles refused (ItemHandler.cpp:750-756)", async () => {
    const scene = soldScene();
    const { rig } = scene;
    try {
      const pending = rig.handle.act.buyback(74);
      await flush();
      rig.inject(
        GameOpcode.SMSG_SELL_ITEM,
        buybackSellItemBody({ itemGuid: 0n, result: 3, vendor: 0n }),
      );
      expect(await pending).toMatchObject({
        reason: "cant_find_vendor",
        status: "refused",
      });
      expect(legacy(scene)).toEqual({
        lastOutcome: undefined,
        pending: undefined,
      });
    } finally {
      rig.dispose();
    }
  });

  test("an inventory failure naming the sold item settles refused inventory_full (ItemHandler.cpp:791, PlayerStorage.cpp:4156-4166)", async () => {
    const scene = soldScene();
    const { rig } = scene;
    try {
      const pending = rig.handle.act.buyback(74);
      await flush();
      rig.inject(
        GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE,
        itemsInventoryChangeFailureBody({ item1: OTHER, result: 50 }),
      );
      expect(rig.handle.state().pending).toBeDefined();
      rig.inject(
        GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE,
        itemsInventoryChangeFailureBody({ item1: BUYBACK_BREAD, result: 50 }),
      );
      expect(await pending).toMatchObject({
        reason: "inventory_full",
        status: "refused",
      });
      expect(legacy(scene)).toEqual({
        lastOutcome: undefined,
        pending: undefined,
      });
    } finally {
      rig.dispose();
    }
  });

  test("no reply in 5 s settles unanswered and frees the next act", async () => {
    jest.useFakeTimers();
    const { rig } = soldScene();
    try {
      const pending = rig.handle.act.buyback(74);
      jest.advanceTimersByTime(4999);
      expect(rig.handle.state().pending).toBeDefined();
      jest.advanceTimersByTime(1);
      expect(await pending).toEqual({ status: "unanswered" });
      expect(rig.handle.state()).toMatchObject({
        lastOutcome: { status: "unanswered" },
        pending: undefined,
      });
    } finally {
      jest.useRealTimers();
      rig.dispose();
    }
  });
});

describe("buyback preconditions", () => {
  test("throws with no vendor window and sends nothing", () => {
    const scene = buybackScene();
    buybackSellBread(scene);
    try {
      expect(() => scene.rig.handle.act.buyback(74)).toThrow("vendor window");
      expect(scene.rig.sent).toEqual([]);
    } finally {
      scene.rig.dispose();
    }
  });

  test("throws while a legacy vendor request is pending", () => {
    const { rig } = soldScene();
    try {
      rig.stores.vendor.begin({
        action: "list",
        coinageBefore: 1008,
        guid: BUYBACK_VENDOR,
        requestedAt: 0,
      });
      expect(() => rig.handle.act.buyback(74)).toThrow("vendor request");
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("throws while a buyback is already pending", async () => {
    jest.useFakeTimers();
    const { rig } = soldScene();
    try {
      const first = rig.handle.act.buyback(74);
      expect(() => rig.handle.act.buyback(74)).toThrow("already pending");
      expect(rig.sent).toHaveLength(1);
      jest.advanceTimersByTime(5000);
      await first;
    } finally {
      jest.useRealTimers();
      rig.dispose();
    }
  });

  test("throws for an empty or out-of-range buyback slot", () => {
    const { rig } = soldScene();
    try {
      expect(() => rig.handle.act.buyback(75)).toThrow("empty");
      expect(() => rig.handle.act.buyback(73)).toThrow("74-85");
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("throws when the price is above the coinage", () => {
    const scene = soldScene();
    buybackCoinage(scene.world, 5);
    try {
      expect(() => scene.rig.handle.act.buyback(74)).toThrow("coinage");
      expect(scene.rig.sent).toEqual([]);
    } finally {
      scene.rig.dispose();
    }
  });
});
