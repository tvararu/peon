import { describe, expect, jest, test } from "bun:test";
import {
  BUYBACK_BAG,
  BUYBACK_ME,
  BUYBACK_VENDOR,
  buybackBuyFailedBody,
  buybackBuyItemBody,
  buybackOpenVendor,
  buybackScene,
  WATER_ENTRY,
} from "#test-support/areas/buyback";
import { itemsInventoryChangeFailureBody } from "#test-support/areas/items";
import { buildBuyItemInSlot } from "#wow/areas/buyback/protocol";
import { GameOpcode } from "#wow/protocol/opcodes";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function openScene() {
  const scene = buybackScene((world) =>
    world.put(255, 19, { bagSlots: 6, entry: 4496, guid: BUYBACK_BAG }),
  );
  buybackOpenVendor(scene.rig);
  return scene;
}

function legacy({ rig }: ReturnType<typeof openScene>) {
  const { pending, lastOutcome } = rig.stores.vendor.snapshot();
  return { lastOutcome, pending };
}

describe("buy into a slot", () => {
  test("sends CMSG_BUY_ITEM_IN_SLOT with the self guid for the backpack and settles ok on SMSG_BUY_ITEM (Player.cpp:10866-10871)", async () => {
    const scene = openScene();
    const { rig } = scene;
    try {
      const pending = rig.handle.act.buyInSlot({
        bag: 255,
        count: 2,
        slot: 30,
        vendorSlot: 1,
      });
      await flush();
      expect(rig.sent).toEqual([
        {
          body: buildBuyItemInSlot({
            bagGuid: BUYBACK_ME,
            bagSlot: 30,
            count: 2,
            item: WATER_ENTRY,
            vendor: BUYBACK_VENDOR,
            vendorSlot: 1,
          }),
          opcode: GameOpcode.CMSG_BUY_ITEM_IN_SLOT,
        },
      ]);
      rig.inject(
        GameOpcode.SMSG_BUY_ITEM,
        buybackBuyItemBody({ count: 2, vendor: BUYBACK_VENDOR, vendorSlot: 2 }),
      );
      expect(rig.handle.state().pending).toBeDefined();
      rig.inject(
        GameOpcode.SMSG_BUY_ITEM,
        buybackBuyItemBody({ count: 2, vendor: BUYBACK_VENDOR, vendorSlot: 1 }),
      );
      expect(await pending).toMatchObject({ status: "ok" });
      expect(legacy(scene)).toEqual({
        lastOutcome: undefined,
        pending: undefined,
      });
    } finally {
      rig.dispose();
    }
  });

  test("sends the bag item's guid for a slot inside a bag (ItemHandler.cpp:806-823)", async () => {
    jest.useFakeTimers();
    const { rig } = openScene();
    try {
      const pending = rig.handle.act.buyInSlot({
        bag: 19,
        count: 1,
        slot: 3,
        vendorSlot: 1,
      });
      expect(rig.sent[0]?.body).toEqual(
        buildBuyItemInSlot({
          bagGuid: BUYBACK_BAG,
          bagSlot: 3,
          count: 1,
          item: WATER_ENTRY,
          vendor: BUYBACK_VENDOR,
          vendorSlot: 1,
        }),
      );
      jest.advanceTimersByTime(5000);
      expect(await pending).toEqual({ status: "unanswered" });
    } finally {
      jest.useRealTimers();
      rig.dispose();
    }
  });

  test("SMSG_BUY_FAILED for the item settles refused (PlayerStorage.cpp:4199-4209)", async () => {
    const scene = openScene();
    const { rig } = scene;
    try {
      const pending = rig.handle.act.buyInSlot({
        bag: 255,
        count: 1,
        slot: 30,
        vendorSlot: 1,
      });
      await flush();
      rig.inject(
        GameOpcode.SMSG_BUY_FAILED,
        buybackBuyFailedBody({
          itemId: 4540,
          result: 2,
          vendor: BUYBACK_VENDOR,
        }),
      );
      expect(rig.handle.state().pending).toBeDefined();
      rig.inject(
        GameOpcode.SMSG_BUY_FAILED,
        buybackBuyFailedBody({
          itemId: WATER_ENTRY,
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

  test("an inventory failure with no item settles refused when nothing else claims it (Player.cpp:10833-10837)", async () => {
    const { rig } = openScene();
    try {
      const pending = rig.handle.act.buyInSlot({
        bag: 255,
        count: 1,
        slot: 30,
        vendorSlot: 1,
      });
      await flush();
      rig.inject(
        GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE,
        itemsInventoryChangeFailureBody({ result: 4 }),
      );
      expect(await pending).toMatchObject({
        reason: "bag_full",
        status: "refused",
      });
    } finally {
      rig.dispose();
    }
  });

  test("refuses a destination that is not empty, a missing vendor slot and a bad bag, and sends nothing", () => {
    const { rig } = openScene();
    try {
      const buy = (bag: number, slot: number, vendorSlot = 1) =>
        rig.handle.act.buyInSlot({ bag, count: 1, slot, vendorSlot });
      expect(() => buy(255, 23)).toThrow("not empty");
      expect(() => buy(255, 30, 9)).toThrow("vendor slot 9");
      expect(() => buy(20, 0)).toThrow("bag 20");
      expect(() => buy(19, 6)).toThrow("bag 19 slot 6");
      expect(() => buy(255, 5)).toThrow("backpack");
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("throws with no vendor window", () => {
    const { rig } = buybackScene();
    try {
      expect(() =>
        rig.handle.act.buyInSlot({
          bag: 255,
          count: 1,
          slot: 30,
          vendorSlot: 1,
        }),
      ).toThrow("vendor window");
    } finally {
      rig.dispose();
    }
  });
});
