import { describe, expect, jest, test } from "bun:test";
import {
  itemsEquipmentSetSavedBody,
  itemsEquipmentSetUseResultBody,
  itemsInventoryChangeFailureBody,
} from "#test-support/areas/items";
import { itemsRig, itemsWorld } from "#test-support/areas/items-world";
import type { ItemsEvent } from "#wow/areas/items/events";
import {
  buildEquipmentSetSave,
  buildEquipmentSetUse,
} from "#wow/areas/items/protocol-sets";
import type { SentPacket } from "#wow/areas/port";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x0a_00n;
const HELM = 0x40_00_00_00_00_00_00_01n;
const CHEST = 0x40_00_00_00_00_00_00_02n;
const STRANGER = 0x40_00_00_00_00_00_00_09n;
const CANT_DO_RIGHT_NOW = 39;
const NO_CHANGE = 59;
const NOT_WHILE_DISARMED = 61;

function setup() {
  const world = itemsWorld(ME);
  world.put(255, 0, { entry: 100, guid: HELM });
  world.put(255, 1, { entry: 101, guid: CHEST });
  const rig = itemsRig(world);
  const events: ItemsEvent[] = [];
  rig.stores.areas.items.onEvent((event) => events.push(event));
  return { events, rig, world };
}

const sends = (sent: readonly SentPacket[], opcode: number) =>
  sent.filter((packet) => packet.opcode === opcode);
const types = (events: readonly ItemsEvent[]) => events.map((e) => e.type);

describe("items runtime: equipment sets", () => {
  test("saveSet sends the worn guids and settles saved on the server's reply", async () => {
    const { events, rig } = setup();
    try {
      const pending = rig.handle.act.saveSet({
        icon: "INV",
        index: 0,
        name: "Peon",
      });
      const sent = sends(rig.sent, GameOpcode.CMSG_EQUIPMENT_SET_SAVE);
      expect(sent).toHaveLength(1);
      const body = sent[0]?.body ?? new Uint8Array();
      expect(body).toEqual(
        buildEquipmentSetSave({
          icon: "INV",
          index: 0,
          items: [HELM, CHEST, ...new Array<bigint>(17).fill(0n)],
          name: "Peon",
          setGuid: 0n,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_SAVED,
        itemsEquipmentSetSavedBody(0, 9n),
      );
      const outcome = await pending;
      expect(outcome).toMatchObject({
        index: 0,
        setGuid: 9n,
        status: "saved",
      });
      expect(rig.handle.state().sets.sets).toHaveLength(1);
      expect(types(events)).toEqual(["set_save_requested", "set_saved"]);
    } finally {
      rig.dispose();
    }
  });

  test("an update with the known guid sends it and settles unconfirmed after 5 s", async () => {
    jest.useFakeTimers();
    const { events, rig } = setup();
    try {
      const created = rig.handle.act.saveSet({
        icon: "INV",
        index: 0,
        name: "Peon",
      });
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_SAVED,
        itemsEquipmentSetSavedBody(0, 9n),
      );
      await created;
      const pending = rig.handle.act.saveSet({
        icon: "INV2",
        index: 0,
        name: "Peon2",
      });
      expect(sends(rig.sent, GameOpcode.CMSG_EQUIPMENT_SET_SAVE)).toHaveLength(
        2,
      );
      jest.advanceTimersByTime(4999);
      expect(rig.handle.state().sets.savePending).toBeDefined();
      jest.advanceTimersByTime(1);
      expect(await pending).toMatchObject({
        status: "saved_unconfirmed",
      });
      expect(types(events).slice(-2)).toEqual([
        "set_save_requested",
        "set_saved",
      ]);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("useSet builds the body from the stored set and returns the failures heard meanwhile", async () => {
    const { events, rig } = setup();
    try {
      const created = rig.handle.act.saveSet({ index: 0, name: "Peon" });
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_SAVED,
        itemsEquipmentSetSavedBody(0, 9n),
      );
      await created;
      const pending = rig.handle.act.useSet(0);
      expect(sends(rig.sent, GameOpcode.CMSG_EQUIPMENT_SET_USE)).toHaveLength(
        1,
      );
      rig.inject(
        GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE,
        itemsInventoryChangeFailureBody({
          item1: HELM,
          result: CANT_DO_RIGHT_NOW,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE,
        itemsInventoryChangeFailureBody({
          item1: STRANGER,
          result: CANT_DO_RIGHT_NOW,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_USE_RESULT,
        itemsEquipmentSetUseResultBody(0),
      );
      expect(await pending).toMatchObject({
        failures: ["cant_do_right_now"],
        status: "ok",
      });
      expect(types(events).slice(-2)).toEqual([
        "set_use_requested",
        "set_used",
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("useSet on result 4 settles bags_full and a use with no answer times out", async () => {
    jest.useFakeTimers();
    const { rig } = setup();
    try {
      const created = rig.handle.act.saveSet({ index: 0, name: "Peon" });
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_SAVED,
        itemsEquipmentSetSavedBody(0, 9n),
      );
      await created;
      const full = rig.handle.act.useSet(0);
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_USE_RESULT,
        itemsEquipmentSetUseResultBody(4),
      );
      expect(await full).toMatchObject({
        failures: [],
        status: "bags_full",
      });
      const pending = rig.handle.act.useSet(0);
      jest.advanceTimersByTime(5000);
      expect(await pending).toMatchObject({ status: "unanswered" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("result 59 during a use is not a failure", async () => {
    const { rig } = setup();
    try {
      const created = rig.handle.act.saveSet({ index: 0, name: "Peon" });
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_SAVED,
        itemsEquipmentSetSavedBody(0, 9n),
      );
      await created;
      const pending = rig.handle.act.useSet(0);
      rig.inject(
        GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE,
        itemsInventoryChangeFailureBody({ item1: HELM, result: NO_CHANGE }),
      );
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_USE_RESULT,
        itemsEquipmentSetUseResultBody(0),
      );
      expect(await pending).toMatchObject({ failures: [], status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("deleteSet drops the set at once and a second delete of the index is refused", async () => {
    const { events, rig } = setup();
    try {
      const created = rig.handle.act.saveSet({ index: 0, name: "Peon" });
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_SAVED,
        itemsEquipmentSetSavedBody(0, 9n),
      );
      await created;
      const removed = await rig.handle.act.deleteSet(0);
      expect(removed.setGuid).toBe(9n);
      expect(sends(rig.sent, GameOpcode.CMSG_DELETEEQUIPMENT_SET)).toHaveLength(
        1,
      );
      expect(types(events).slice(-1)).toEqual(["set_deleted"]);
      await expect(rig.handle.act.deleteSet(0)).rejects.toThrow(/no set/);
    } finally {
      rig.dispose();
    }
  });

  test("an unknown index, a second pending save and bad fields are refused before sending, a dead character too", async () => {
    const { rig, world } = setup();
    try {
      const stuck = rig.handle.act.saveSet({ index: 0, name: "Peon" });
      await expect(
        rig.handle.act.saveSet({ index: 0, name: "Other" }),
      ).rejects.toThrow("a set save is already pending");
      expect(sends(rig.sent, GameOpcode.CMSG_EQUIPMENT_SET_SAVE)).toHaveLength(
        1,
      );
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_SAVED,
        itemsEquipmentSetSavedBody(0, 9n),
      );
      await stuck;
      const refusals: [() => Promise<unknown>, string][] = [
        [() => rig.handle.act.useSet(3), "no set is stored at index 3"],
        [() => rig.handle.act.deleteSet(3), "no set is stored at index 3"],
        [
          () => rig.handle.act.saveSet({ index: 0, name: "x".repeat(17) }),
          "set name is over 16 bytes",
        ],
        [
          () => rig.handle.act.saveSet({ index: 10, name: "Peon" }),
          "set index 10 is not between 0 and 9",
        ],
      ];
      for (const [refuse, reason] of refusals)
        await expect((async () => refuse())()).rejects.toThrow(reason);
      world.setHealth(0);
      await expect(
        rig.handle.act.saveSet({ index: 1, name: "Peon" }),
      ).rejects.toThrow("dead");
      expect(sends(rig.sent, GameOpcode.CMSG_EQUIPMENT_SET_SAVE)).toHaveLength(
        1,
      );
    } finally {
      rig.dispose();
    }
  });

  test("a bag worn in slot 19 cannot stand in for equipment slot 1", async () => {
    const world = itemsWorld(ME);
    world.put(255, 0, { entry: 100, guid: HELM });
    world.put(255, 19, { entry: 4500, guid: CHEST, bagSlots: 16 });
    const rig = itemsRig(world);
    try {
      const refused = rig.handle.act.saveSet({
        icon: "",
        index: 0,
        items: Array.from({ length: 19 }, (_, slot) =>
          slot === 1 ? CHEST : 0n,
        ),
        name: "Peon",
      });
      await expect(refused).rejects.toThrow(/slot 1/);
      expect(sends(rig.sent, GameOpcode.CMSG_EQUIPMENT_SET_SAVE)).toHaveLength(
        0,
      );
      expect(rig.handle.state().sets.savePending).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("swapped equipment guids are refused and ignored or empty slots pass", async () => {
    const { rig } = setup();
    try {
      const swapped = Array.from({ length: 19 }, (_, slot) => {
        if (slot === 0) return CHEST;
        return slot === 1 ? HELM : 0n;
      });
      await expect(
        rig.handle.act.saveSet({ index: 0, items: swapped, name: "Peon" }),
      ).rejects.toThrow(/slot 0/);
      const sentinels = Array.from({ length: 19 }, (_, slot) => {
        if (slot === 0) return HELM;
        return slot === 1 ? 1n : 0n;
      });
      const pending = rig.handle.act.saveSet({
        index: 0,
        items: sentinels,
        name: "Peon",
      });
      expect(sends(rig.sent, GameOpcode.CMSG_EQUIPMENT_SET_SAVE)).toHaveLength(
        1,
      );
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_SAVED,
        itemsEquipmentSetSavedBody(0, 9n),
      );
      expect(await pending).toMatchObject({ status: "saved" });
    } finally {
      rig.dispose();
    }
  });

  test("a failure naming the item a set unequips is owned by the use", async () => {
    const { rig } = setup();
    try {
      const created = rig.handle.act.saveSet({
        index: 0,
        items: Array.from({ length: 19 }, (_, slot) =>
          slot === 1 ? CHEST : 0n,
        ),
        name: "Peon",
      });
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_SAVED,
        itemsEquipmentSetSavedBody(0, 9n),
      );
      await created;
      const pending = rig.handle.act.useSet(0);
      rig.inject(
        GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE,
        itemsInventoryChangeFailureBody({
          item1: HELM,
          result: NOT_WHILE_DISARMED,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE,
        itemsInventoryChangeFailureBody({
          item1: STRANGER,
          result: NOT_WHILE_DISARMED,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_USE_RESULT,
        itemsEquipmentSetUseResultBody(0),
      );
      expect(await pending).toMatchObject({
        failures: ["not_while_disarmed"],
        status: "ok",
      });
    } finally {
      rig.dispose();
    }
  });

  test("a saved item missing from the carried snapshot keeps its guid in the use request", async () => {
    const world = itemsWorld(ME);
    world.put(255, 0, { entry: 100, guid: HELM });
    world.put(255, 1, { entry: 101, guid: CHEST });
    const rig = itemsRig(world);
    try {
      const created = rig.handle.act.saveSet({ index: 0, name: "Peon" });
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_SAVED,
        itemsEquipmentSetSavedBody(0, 9n),
      );
      await created;
      world.clear(255, 1);
      const pending = rig.handle.act.useSet(0);
      const [sent] = sends(rig.sent, GameOpcode.CMSG_EQUIPMENT_SET_USE);
      const expected = buildEquipmentSetUse(
        Array.from({ length: 19 }, (_, slot) => {
          if (slot === 0) return { bag: 255, guid: HELM, slot: 0 };
          if (slot === 1) return { bag: 0, guid: CHEST, slot: 0 };
          return { bag: 0, guid: 0n, slot: 0 };
        }),
      );
      expect(Array.from(sent?.body ?? [])).toEqual(Array.from(expected));
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_USE_RESULT,
        itemsEquipmentSetUseResultBody(0),
      );
      await pending;
    } finally {
      rig.dispose();
    }
  });

  test("dispose releases a waiting save", async () => {
    const { rig } = setup();
    const pending = rig.handle.act.saveSet({ index: 0, name: "Peon" });
    rig.dispose();
    await expect(pending).rejects.toThrow();
  });
});
