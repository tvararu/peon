import { describe, expect, test } from "bun:test";
import {
  itemsInventoryChangeFailureBody,
  itemsTemplate,
} from "#test-support/areas/items";
import {
  type ItemsWorld,
  itemsRig,
  itemsWorld,
} from "#test-support/areas/items-world";
import {
  buildAutoEquipItem,
  buildAutoEquipItemSlot,
  buildAutostoreBagItem,
  buildSplitItem,
  buildSwapInvItem,
  buildSwapItem,
} from "#wow/areas/items/protocol";
import type { SentPacket } from "#wow/areas/port";
import { registerLootHandlers } from "#wow/gameplay-handlers";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { WorldConn } from "#wow/world-conn";

const ME = 0x0a_00n;
const SWORD = 0x40_00_00_00_00_00_00_01n;
const HELM = 0x40_00_00_00_00_00_00_02n;
const WATER = 0x40_00_00_00_00_00_00_03n;
const OTHER = 0x40_00_00_00_00_00_00_09n;
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

const sends = (sent: readonly SentPacket[], opcode: number) =>
  sent.filter((packet) => packet.opcode === opcode);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("items runtime: equip", () => {
  test("equip sends CMSG_AUTOEQUIP_ITEM and settles confirmed from the inventory update", async () => {
    const { rig, world } = setup();
    try {
      const pending = rig.handle.act.equip({ bag: 255, slot: 23 });
      await flush();
      expect(sends(rig.sent, GameOpcode.CMSG_AUTOEQUIP_ITEM)).toEqual([
        {
          body: buildAutoEquipItem({ bag: 255, slot: 23 }),
          opcode: GameOpcode.CMSG_AUTOEQUIP_ITEM,
        },
      ]);
      world.clear(255, 23);
      world.put(255, 15, { entry: 25, guid: SWORD });
      rig.touch();
      expect(await pending).toMatchObject({
        last: { status: "confirmed" },
        pending: undefined,
      });
    } finally {
      rig.dispose();
    }
  });

  test("a failure naming the item settles refused (PlayerStorage.cpp:4156-4196)", async () => {
    const { rig } = setup();
    try {
      const pending = rig.handle.act.equip({ bag: 255, slot: 23 });
      await flush();
      rig.inject(
        FAIL,
        itemsInventoryChangeFailureBody({ item1: OTHER, result: 22 }),
      );
      expect(rig.handle.state().move.pending).toBeDefined();
      rig.inject(
        FAIL,
        itemsInventoryChangeFailureBody({
          item1: SWORD,
          requiredLevel: 10,
          result: 1,
        }),
      );
      expect(await pending).toMatchObject({
        last: { reason: "cant_equip_level_i", status: "refused" },
      });
    } finally {
      rig.dispose();
    }
  });

  test("result 59 settles no_change (ItemHandler.cpp:1001-1006)", async () => {
    const { rig } = setup((w) => w.put(255, 15, { entry: 7, guid: HELM }));
    try {
      const pending = rig.handle.act.unequip(15);
      rig.inject(
        FAIL,
        itemsInventoryChangeFailureBody({ item1: HELM, result: 59 }),
      );
      expect(await pending).toMatchObject({ last: { status: "no_change" } });
    } finally {
      rig.dispose();
    }
  });

  test("equipTo sends CMSG_AUTOEQUIP_ITEM_SLOT and settles in the named slot", async () => {
    const { rig, world } = setup();
    try {
      const pending = rig.handle.act.equipTo(SWORD, 16);
      await flush();
      expect(sends(rig.sent, GameOpcode.CMSG_AUTOEQUIP_ITEM_SLOT)).toEqual([
        {
          body: buildAutoEquipItemSlot(SWORD, 16),
          opcode: GameOpcode.CMSG_AUTOEQUIP_ITEM_SLOT,
        },
      ]);
      world.clear(255, 23);
      world.put(255, 16, { entry: 25, guid: SWORD });
      rig.touch();
      expect(await pending).toMatchObject({ last: { status: "confirmed" } });
    } finally {
      rig.dispose();
    }
  });

  test("equip needs a known template with an inventory type", async () => {
    const { rig } = setup((world) =>
      world.put(255, 30, { entry: 117, guid: OTHER }),
    );
    try {
      rig.stores.items.receive({ entry: 117, template: undefined });
      await expect(
        rig.handle.act.equip({ bag: 255, slot: 30 }),
      ).rejects.toThrow("template");
      rig.stores.items.receive({
        entry: 117,
        template: itemsTemplate({ entry: 117, inventoryType: 0 }),
      });
      await expect(
        rig.handle.act.equip({ bag: 255, slot: 30 }),
      ).rejects.toThrow("not equippable");
      expect(sends(rig.sent, GameOpcode.CMSG_AUTOEQUIP_ITEM)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});

describe("items runtime: unequip, move and split", () => {
  test("unequip sends CMSG_AUTOSTORE_BAG_ITEM to NULL_BAG unless a bag is named (Item.h:40, PlayerStorage.cpp:605-609)", async () => {
    const { rig, world } = setup((w) =>
      w.put(255, 0, { entry: 7, guid: HELM }),
    );
    try {
      const first = rig.handle.act.unequip(0);
      world.clear(255, 0);
      world.put(255, 30, { entry: 7, guid: HELM });
      rig.touch();
      expect(await first).toMatchObject({ last: { status: "confirmed" } });
      const second = rig.handle.act.unequip(16, 19);
      expect(sends(rig.sent, GameOpcode.CMSG_AUTOSTORE_BAG_ITEM)).toEqual([
        {
          body: buildAutostoreBagItem({ bag: 255, slot: 0 }, 0),
          opcode: GameOpcode.CMSG_AUTOSTORE_BAG_ITEM,
        },
      ]);
      await expect(second).rejects.toThrow("slot 16");
    } finally {
      rig.dispose();
    }
  });
  test("unequip to bag 255 stores into the backpack (CanStoreItem bag 255, NULL_SLOT)", async () => {
    const { rig, world } = setup((w) =>
      w.put(255, 0, { entry: 7, guid: HELM }),
    );
    try {
      const pending = rig.handle.act.unequip(0, 255);
      expect(sends(rig.sent, GameOpcode.CMSG_AUTOSTORE_BAG_ITEM)).toEqual([
        {
          body: buildAutostoreBagItem({ bag: 255, slot: 0 }, 255),
          opcode: GameOpcode.CMSG_AUTOSTORE_BAG_ITEM,
        },
      ]);
      world.clear(255, 0);
      world.put(255, 30, { entry: 7, guid: HELM });
      rig.touch();
      expect(await pending).toMatchObject({ last: { status: "confirmed" } });
      await expect(rig.handle.act.unequip(0, 5)).rejects.toThrow("bag 5");
    } finally {
      rig.dispose();
    }
  });

  test("move sends CMSG_SWAP_INV_ITEM inside bag 255 and CMSG_SWAP_ITEM otherwise", async () => {
    const { rig } = setup((w) =>
      w.put(255, 19, { bagSlots: 6, entry: 4496, guid: HELM }),
    );
    try {
      const first = rig.handle.act.move(
        { bag: 255, slot: 23 },
        { bag: 255, slot: 30 },
      );
      expect(rig.sent.at(-1)).toEqual({
        body: buildSwapInvItem(30, 23),
        opcode: GameOpcode.CMSG_SWAP_INV_ITEM,
      });
      rig.inject(
        FAIL,
        itemsInventoryChangeFailureBody({ item1: SWORD, result: 59 }),
      );
      expect(await first).toMatchObject({ last: { status: "no_change" } });
      rig.handle.act
        .move({ bag: 255, slot: 24 }, { bag: 19, slot: 2 })
        .catch(() => undefined);
      expect(rig.sent.at(-1)).toEqual({
        body: buildSwapItem({ bag: 19, slot: 2 }, { bag: 255, slot: 24 }),
        opcode: GameOpcode.CMSG_SWAP_ITEM,
      });
    } finally {
      rig.dispose();
    }
  });

  test("move out of an equipment slot is an unequip request; between carried slots it is a swap", async () => {
    const { rig, world } = setup((w) =>
      w.put(255, 15, { entry: 7, guid: HELM }),
    );
    try {
      const off = rig.handle.act.move(
        { bag: 255, slot: 15 },
        { bag: 255, slot: 34 },
      );
      expect(rig.sent.at(-1)).toEqual({
        body: buildAutostoreBagItem({ bag: 255, slot: 15 }, 0),
        opcode: GameOpcode.CMSG_AUTOSTORE_BAG_ITEM,
      });
      world.clear(255, 15);
      world.put(255, 34, { entry: 7, guid: HELM });
      rig.touch();
      expect(await off).toMatchObject({
        last: {
          request: { kind: "unequip" },
          status: "confirmed",
        },
      });
      const carried = rig.handle.act.move(
        { bag: 255, slot: 23 },
        { bag: 255, slot: 30 },
      );
      world.clear(255, 23);
      world.put(255, 30, { entry: 25, guid: SWORD });
      rig.touch();
      expect(await carried).toMatchObject({
        last: { request: { kind: "swap" }, status: "confirmed" },
      });
    } finally {
      rig.dispose();
    }
  });

  test("bank and buyback positions are refused until economy reads them", async () => {
    const { rig } = setup();
    try {
      await expect(
        rig.handle.act.move({ bag: 255, slot: 23 }, { bag: 255, slot: 40 }),
      ).rejects.toThrow("bank");
      await expect(
        rig.handle.act.move({ bag: 255, slot: 23 }, { bag: 255, slot: 80 }),
      ).rejects.toThrow("buyback");
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("split sends CMSG_SPLIT_ITEM with the count and checks it against the stack", async () => {
    const { rig, world } = setup();
    try {
      await expect(
        rig.handle.act.split({ bag: 255, slot: 24 }, { bag: 255, slot: 30 }, 0),
      ).rejects.toThrow("count");
      await expect(
        rig.handle.act.split(
          { bag: 255, slot: 24 },
          { bag: 255, slot: 30 },
          20,
        ),
      ).rejects.toThrow("count");
      const pending = rig.handle.act.split(
        { bag: 255, slot: 24 },
        { bag: 255, slot: 30 },
        5,
      );
      expect(rig.sent).toEqual([
        {
          body: buildSplitItem(
            { bag: 255, slot: 24 },
            { bag: 255, slot: 30 },
            5,
          ),
          opcode: GameOpcode.CMSG_SPLIT_ITEM,
        },
      ]);
      world.setCount(WATER, 15);
      world.put(255, 30, { count: 5, entry: 159, guid: OTHER });
      rig.touch();
      expect(await pending).toMatchObject({ last: { status: "confirmed" } });
    } finally {
      rig.dispose();
    }
  });
});
