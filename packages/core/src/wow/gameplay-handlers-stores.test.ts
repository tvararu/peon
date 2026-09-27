import { describe, expect, test } from "bun:test";
import { LESSER_HEALING_POTION_RESPONSE } from "#test-support/item-query-fixtures";
import {
  createObject,
  info,
  type MotionFixture,
  motionFixture,
} from "#test-support/remote-motion-fixtures";
import { ObjectType } from "#wow/protocol/entity-fields";
import { InventoryResult } from "#wow/protocol/inventory";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";

const SELF = 0x42n;
const MOB = 0xf130003d29021c28n;

async function session(run: (f: MotionFixture) => Promise<void>) {
  const f = await motionFixture();
  try {
    await f.inject(
      GameOpcode.SMSG_UPDATE_OBJECT,
      createObject(MOB, info(40), ObjectType.UNIT),
    );
    await run(f);
  } finally {
    await f.close();
  }
}

function initialSpells(spells: number[]): Uint8Array {
  const w = new PacketWriter();
  w.uint8(0);
  w.uint16LE(spells.length);
  for (const spell of spells) {
    w.uint32LE(spell);
    w.uint16LE(0);
  }
  w.uint16LE(0);
  return w.finish();
}

function guids(...values: bigint[]): Uint8Array {
  const w = new PacketWriter();
  for (const value of values) w.uint64LE(value);
  return w.finish();
}

function xpGain(victim: bigint, total: number): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(victim);
  w.uint32LE(total);
  w.uint8(0);
  w.uint32LE(total);
  w.floatLE(1);
  w.uint8(0);
  return w.finish();
}

function itemPush(guid: bigint, itemId: number, count: number): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  for (const value of [1, 0, 1]) w.uint32LE(value);
  w.uint8(255);
  for (const value of [23, itemId, 0, 0, count, count]) w.uint32LE(value);
  return w.finish();
}

function inventoryFull(): Uint8Array {
  const w = new PacketWriter();
  w.uint8(InventoryResult.INVENTORY_FULL);
  w.uint64LE(0n);
  w.uint64LE(0n);
  w.uint8(0);
  return w.finish();
}

function startRoll(guid: bigint, itemId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  for (const value of [530, 2, itemId, 0, 0, 1, 60_000]) w.uint32LE(value);
  w.uint8(0x07);
  return w.finish();
}

describe("combat packets over the wire", () => {
  test("spellbook, attackers and kill XP land in the session's combat state", async () => {
    await session(async (f) => {
      await f.inject(GameOpcode.SMSG_INITIAL_SPELLS, initialSpells([17, 133]));
      await f.inject(
        GameOpcode.SMSG_LEARNED_SPELL,
        Uint8Array.of(116, 0, 0, 0),
      );
      await f.inject(GameOpcode.SMSG_ATTACKSTART, guids(MOB, SELF));
      await f.inject(GameOpcode.SMSG_LOG_XPGAIN, xpGain(MOB, 45));
      expect(f.handle.getCombatState()).toMatchObject({
        attackers: [MOB],
        learned: [17, 133, 116],
        lastXp: { kind: "kill", total: 45, victim: MOB },
      });
      expect(f.errors).toEqual([]);
    });
  });
});

describe("loot packets over the wire", () => {
  test("item pushes, inventory errors and roll offers land in the rewards state", async () => {
    await session(async (f) => {
      await f.inject(GameOpcode.SMSG_ITEM_PUSH_RESULT, itemPush(SELF, 858, 2));
      await f.inject(GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE, inventoryFull());
      await f.inject(GameOpcode.SMSG_LOOT_START_ROLL, startRoll(MOB, 858));
      const state = f.handle.getRewardsState();
      expect(state.lastItemPush).toMatchObject({ count: 2, itemId: 858 });
      expect(state.lastInventoryError).toMatchObject({ inventoryFull: true });
      expect(state.rolls.pending).toEqual([
        expect.objectContaining({ guid: MOB, itemId: 858, slot: 2 }),
      ]);
      expect(f.errors).toEqual([]);
    });
  });

  test("an item query response names the item in later labels", async () => {
    await session(async (f) => {
      expect(f.handle.itemLabel(858).name).toBeNull();
      await f.inject(
        GameOpcode.SMSG_ITEM_QUERY_SINGLE_RESPONSE,
        LESSER_HEALING_POTION_RESPONSE,
      );
      expect(f.handle.itemLabel(858).name).toBe("Lesser Healing Potion");
    });
  });
});
