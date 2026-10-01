import { describe, expect, test } from "bun:test";
import {
  itemsEquipmentSetSavedBody,
  itemsEquipmentSetUseResultBody,
  itemsInventoryChangeFailureBody,
} from "#test-support/areas/items";
import { itemsRig, itemsWorld } from "#test-support/areas/items-world";
import type { SentPacket } from "#wow/areas/port";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x0a_00n;
const HELM = 0x40_00_00_00_00_00_00_01n;
const CHEST = 0x40_00_00_00_00_00_00_02n;
const NOT_WHILE_DISARMED = 61;
const DISARMED = 0x40_00_00_00_00_00_00_07n;

function setup() {
  const world = itemsWorld(ME);
  world.put(255, 0, { entry: 100, guid: HELM });
  world.put(255, 1, { entry: 101, guid: CHEST });
  return { rig: itemsRig(world) };
}

function failSends(rig: { sent: readonly SentPacket[] }): () => void {
  const sent = rig.sent as SentPacket[];
  const push = sent.push;
  sent.push = () => {
    throw new Error("the world socket is unavailable");
  };
  return () => {
    sent.push = push;
  };
}

describe("items runtime: sets with an unavailable socket and overlapping acts", () => {
  test("a save that cannot be sent rejects, frees the pending claim and can be retried", async () => {
    const { rig } = setup();
    try {
      const restore = failSends(rig);
      await expect(
        rig.handle.act.saveSet({ index: 0, name: "Peon" }),
      ).rejects.toThrow(/unavailable/);
      expect(
        rig.stores.areas.items.snapshot().sets.savePending,
      ).toBeUndefined();
      restore();
      const retry = rig.handle.act.saveSet({ index: 0, name: "Peon" });
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_SAVED,
        itemsEquipmentSetSavedBody(0, 9n),
      );
      expect(await retry).toMatchObject({ status: "saved" });
    } finally {
      rig.dispose();
    }
  });

  test("a use that cannot be sent rejects, frees the pending claim and can be retried", async () => {
    const { rig } = setup();
    try {
      const created = rig.handle.act.saveSet({ index: 0, name: "Peon" });
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_SAVED,
        itemsEquipmentSetSavedBody(0, 9n),
      );
      await created;
      const restore = failSends(rig);
      await expect(rig.handle.act.useSet(0)).rejects.toThrow(/unavailable/);
      expect(rig.stores.areas.items.snapshot().sets.usePending).toBeUndefined();
      restore();
      const retry = rig.handle.act.useSet(0);
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_USE_RESULT,
        itemsEquipmentSetUseResultBody(0),
      );
      expect(await retry).toMatchObject({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("a delete that cannot be sent keeps the cached set", async () => {
    const { rig } = setup();
    try {
      const created = rig.handle.act.saveSet({ index: 0, name: "Peon" });
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_SAVED,
        itemsEquipmentSetSavedBody(0, 9n),
      );
      await created;
      const restore = failSends(rig);
      await expect(rig.handle.act.deleteSet(0)).rejects.toThrow(/unavailable/);
      expect(rig.stores.areas.items.snapshot().sets.sets).toHaveLength(1);
      restore();
      expect((await rig.handle.act.deleteSet(0)).setGuid).toBe(9n);
      expect(rig.stores.areas.items.snapshot().sets.sets).toHaveLength(0);
    } finally {
      rig.dispose();
    }
  });

  test("a move cannot start while a set use is pending, so the use keeps its failures", async () => {
    const world = itemsWorld(ME);
    world.put(255, 15, { entry: 100, guid: HELM });
    const rig = itemsRig(world);
    try {
      const created = rig.handle.act.saveSet({ index: 0, name: "Peon" });
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_SAVED,
        itemsEquipmentSetSavedBody(0, 9n),
      );
      await created;
      world.clear(255, 15);
      world.put(255, 15, { entry: 101, guid: DISARMED });
      world.put(255, 23, { entry: 100, guid: HELM });
      const pending = rig.handle.act.useSet(0);
      await expect(rig.handle.act.unequip(15)).rejects.toThrow(/set use/);
      rig.inject(
        GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE,
        itemsInventoryChangeFailureBody({
          item1: DISARMED,
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

  test("a set use cannot start while a move is pending", async () => {
    const { rig } = setup();
    try {
      const created = rig.handle.act.saveSet({ index: 0, name: "Peon" });
      rig.inject(
        GameOpcode.SMSG_EQUIPMENT_SET_SAVED,
        itemsEquipmentSetSavedBody(0, 9n),
      );
      await created;
      const move = rig.handle.act.unequip(1);
      await expect(rig.handle.act.useSet(0)).rejects.toThrow(/move/);
      rig.dispose();
      await move.catch(() => undefined);
    } finally {
      rig.dispose();
    }
  });
});
