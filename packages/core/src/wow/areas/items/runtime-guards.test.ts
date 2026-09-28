import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  itemsInventoryChangeFailureBody,
  itemsTemplate,
} from "#test-support/areas/items";
import {
  type ItemsWorld,
  itemsRig,
  itemsWorld,
} from "#test-support/areas/items-world";
import { buildSetAmmo } from "#wow/areas/items/protocol";
import type { ItemsEvent } from "#wow/areas/items/store";
import { registerLootHandlers } from "#wow/gameplay-handlers";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { WorldConn } from "#wow/world-conn";

const ME = 0x0a_00n;
const SWORD = 0x40_00_00_00_00_00_00_01n;
const AXE = 0x40_00_00_00_00_00_00_05n;
const WATER = 0x40_00_00_00_00_00_00_03n;
const JUNK = 0x40_00_00_00_00_00_00_09n;
const FAIL = GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE;

function setup(seed: (world: ItemsWorld) => void = () => undefined) {
  const world = itemsWorld(ME);
  world.put(255, 23, { entry: 25, guid: SWORD });
  world.put(255, 24, { count: 20, entry: 159, guid: WATER });
  seed(world);
  const rig = itemsRig(world, (dispatch, stores) =>
    registerLootHandlers({ dispatch } as unknown as WorldConn, stores),
  );
  rig.stores.items.receive({ entry: 25, template: itemsTemplate({}) });
  return { rig, world };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("items runtime preconditions", () => {
  test("every act needs the character in the world", async () => {
    const rig = areaRig("items");
    try {
      await expect(rig.handle.act.unequip(15)).rejects.toThrow("not in world");
      await expect(
        rig.handle.act.move({ bag: 255, slot: 23 }, { bag: 255, slot: 24 }),
      ).rejects.toThrow("not in world");
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a dead character may only unequip", async () => {
    const { rig, world } = setup((w) =>
      w.put(255, 15, { entry: 25, guid: AXE }),
    );
    world.setHealth(0);
    try {
      await expect(
        rig.handle.act.equip({ bag: 255, slot: 23 }),
      ).rejects.toThrow("dead");
      await expect(
        rig.handle.act.split({ bag: 255, slot: 24 }, { bag: 255, slot: 30 }, 2),
      ).rejects.toThrow("dead");
      rig.handle.act.unequip(15).catch(() => undefined);
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_AUTOSTORE_BAG_ITEM,
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a second move waits for the first, and the source must hold the item", async () => {
    const { rig } = setup();
    try {
      rig.handle.act
        .move({ bag: 255, slot: 23 }, { bag: 255, slot: 30 })
        .catch(() => undefined);
      await expect(
        rig.handle.act.move({ bag: 255, slot: 24 }, { bag: 255, slot: 31 }),
      ).rejects.toThrow("pending");
      rig.inject(
        FAIL,
        itemsInventoryChangeFailureBody({ item1: SWORD, result: 22 }),
      );
      await flush();
      await expect(
        rig.handle.act.move({ bag: 255, slot: 33 }, { bag: 255, slot: 31 }),
      ).rejects.toThrow("empty");
      await expect(rig.handle.act.equipTo(JUNK, 15)).rejects.toThrow("carried");
      expect(rig.sent).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });
});

describe("items runtime settling", () => {
  test("no reply in 5 s settles unanswered and frees the next move", async () => {
    jest.useFakeTimers();
    const { rig } = setup();
    try {
      const pending = rig.handle.act.move(
        { bag: 255, slot: 23 },
        { bag: 255, slot: 30 },
      );
      jest.advanceTimersByTime(4999);
      expect(rig.handle.state().move.pending).toBeDefined();
      jest.advanceTimersByTime(1);
      expect(await pending).toMatchObject({
        last: { status: "unanswered" },
        pending: undefined,
      });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a failure with no item while a destroy waits settles the destroy and leaves the move unanswered (SR1-items-6)", async () => {
    jest.useFakeTimers();
    const { rig } = setup();
    try {
      const pending = rig.handle.act.move(
        { bag: 255, slot: 23 },
        { bag: 255, slot: 30 },
      );
      rig.stores.destroy.begin({
        bag: 255,
        count: 20,
        itemGuid: WATER,
        itemId: 159,
        requestedAt: 0,
        slot: 24,
        stackBefore: 20,
      });
      rig.inject(FAIL, itemsInventoryChangeFailureBody({ result: 23 }));
      expect(rig.stores.destroy.snapshot().lastOutcome).toMatchObject({
        reason: "item_not_found",
        status: "refused",
      });
      expect(rig.handle.state().move.pending).toBeDefined();
      jest.advanceTimersByTime(5000);
      expect(await pending).toMatchObject({ last: { status: "unanswered" } });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("dispose rejects a pending move with the abort reason", async () => {
    const { rig } = setup();
    const pending = rig.handle.act.move(
      { bag: 255, slot: 23 },
      { bag: 255, slot: 30 },
    );
    rig.dispose();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("items runtime: setAmmo", () => {
  test("setAmmo sends CMSG_SET_AMMO and settles confirmed from the loaded id (PlayerStorage.cpp:2628-2648)", async () => {
    const { rig, world } = setup((w) =>
      w.put(255, 25, {
        count: 200,
        entry: 2512,
        guid: 0x40_00_00_00_00_00_00_04n,
      }),
    );
    try {
      const pending = rig.handle.act.setAmmo(2512);
      await flush();
      expect(
        rig.sent.filter((packet) => packet.opcode === GameOpcode.CMSG_SET_AMMO),
      ).toEqual([
        {
          body: buildSetAmmo(2512),
          opcode: GameOpcode.CMSG_SET_AMMO,
        },
      ]);
      world.setAmmo(2512);
      rig.touch();
      expect(await pending).toMatchObject({
        last: { request: { entry: 2512 }, status: "confirmed" },
        pending: undefined,
      });
    } finally {
      rig.dispose();
    }
  });

  test("a missing stack settles refused, entry 0 unloads (ItemHandler.cpp:1014-1039)", async () => {
    const { rig, world } = setup((w) => {
      w.setAmmo(2512);
      w.put(255, 25, {
        count: 1,
        entry: 19_319,
        guid: 0x40_00_00_00_00_00_00_04n,
      });
    });
    try {
      const missing = rig.handle.act.setAmmo(19_319);
      await flush();
      rig.inject(FAIL, itemsInventoryChangeFailureBody({ result: 23 }));
      expect(await missing).toMatchObject({ last: { status: "refused" } });
      const unload = rig.handle.act.setAmmo(0);
      await flush();
      world.setAmmo(0);
      rig.touch();
      expect(await unload).toMatchObject({
        last: { request: { entry: 0 }, status: "confirmed" },
      });
    } finally {
      rig.dispose();
    }
  });

  test("no reply in 5 s settles unanswered", async () => {
    jest.useFakeTimers();
    const { rig } = setup((w) =>
      w.put(255, 25, {
        count: 200,
        entry: 2512,
        guid: 0x40_00_00_00_00_00_00_04n,
      }),
    );
    try {
      const pending = rig.handle.act.setAmmo(2512);
      jest.advanceTimersByTime(5000);
      expect(await pending).toMatchObject({
        last: { status: "unanswered" },
        pending: undefined,
      });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("uncarried or already loaded ammo is rejected before sending", async () => {
    const { rig } = setup();
    try {
      await expect(rig.handle.act.setAmmo(19_319)).rejects.toThrow(
        "is not carried",
      );
      await expect(rig.handle.act.setAmmo(0)).rejects.toThrow("already loaded");
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});

describe("items runtime: item_received", () => {
  test("an item push emits the template level, inventory type and the worn level in that slot", async () => {
    const { rig } = setup((w) => {
      w.put(255, 15, { entry: 25, guid: SWORD + 100n });
      w.put(255, 30, { entry: 2488, guid: AXE });
    });
    const events: ItemsEvent[] = [];
    rig.handle.onEvent((event) => events.push(event));
    try {
      rig.stores.items.receive({
        entry: 2488,
        template: itemsTemplate({
          entry: 2488,
          inventoryType: 13,
          itemLevel: 17,
        }),
      });
      rig.stores.rewards.receiveItemPush({
        bagSlot: 255,
        count: 1,
        created: 0,
        guid: ME,
        itemId: 2488,
        randomPropertyId: 0,
        randomSuffix: 0,
        received: 1,
        showInChat: 1,
        slot: 30,
        totalCount: 1,
      });
      await flush();
      expect(events).toEqual([
        {
          entry: 2488,
          guid: AXE,
          inventoryType: 13,
          itemLevel: 17,
          type: "item_received",
          wornItemLevel: 2,
        },
      ]);
    } finally {
      rig.dispose();
    }
  });
});
