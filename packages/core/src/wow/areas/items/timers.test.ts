import { describe, expect, test } from "bun:test";
import {
  itemsItemCooldownBody,
  itemsItemEnchantTimeUpdateBody,
  itemsItemTimeUpdateBody,
  itemsSetProficiencyBody,
} from "#test-support/areas/items";
import { itemsRig, itemsWorld } from "#test-support/areas/items-world";
import type { ItemsEvent } from "#wow/areas/items/events";
import { TimerSlice } from "#wow/areas/items/timers";
import { GameOpcode } from "#wow/protocol/opcodes";

const SWORD = 0x40_00_00_00_00_00_00_01n;
const RING = 0x40_00_00_00_00_00_00_02n;
const ME = 0x0a_00n;

describe("TimerSlice", () => {
  test("starts empty with both proficiency masks unknown", () => {
    expect(new TimerSlice().snapshot()).toEqual({
      cooldowns: [],
      enchants: [],
      proficiency: { armor: "unknown", weapon: "unknown" },
      timers: [],
    });
  });

  test("an item time becomes an absolute expiry from the clock at receipt", () => {
    const slice = new TimerSlice();
    slice.time({ itemGuid: SWORD, seconds: 120 }, 5000);
    expect(slice.snapshot().timers).toEqual([
      { expiresAt: 125_000, itemGuid: SWORD, seconds: 120, seenAt: 5000 },
    ]);
  });

  test("a later update for the same item replaces the expiry, also when it rises", () => {
    const slice = new TimerSlice();
    slice.time({ itemGuid: SWORD, seconds: 100 }, 1000);
    slice.time({ itemGuid: RING, seconds: 50 }, 1000);
    slice.time({ itemGuid: SWORD, seconds: 900 }, 2000);
    expect(slice.snapshot().timers).toEqual([
      { expiresAt: 902_000, itemGuid: SWORD, seconds: 900, seenAt: 2000 },
      { expiresAt: 51_000, itemGuid: RING, seconds: 50, seenAt: 1000 },
    ]);
  });

  test("enchant timers are kept per item and enchant slot", () => {
    const slice = new TimerSlice();
    const packet = { itemGuid: SWORD, playerGuid: ME, seconds: 1800, slot: 1 };
    slice.enchant(packet, 0);
    slice.enchant({ ...packet, slot: 3 }, 0);
    slice.enchant({ ...packet, seconds: 1700 }, 10_000);
    expect(slice.snapshot().enchants).toEqual([
      {
        expiresAt: 1_710_000,
        itemGuid: SWORD,
        seconds: 1700,
        seenAt: 10_000,
        slot: 1,
      },
      {
        expiresAt: 1_800_000,
        itemGuid: SWORD,
        seconds: 1800,
        seenAt: 0,
        slot: 3,
      },
    ]);
  });

  test("a cooldown keeps the item, the spell and the latest time seen, once per pair", () => {
    const slice = new TimerSlice();
    slice.cooldown({ itemGuid: SWORD, spell: 7000 }, 1000);
    slice.cooldown({ itemGuid: SWORD, spell: 7001 }, 1500);
    slice.cooldown({ itemGuid: SWORD, spell: 7000 }, 4000);
    expect(slice.snapshot().cooldowns).toEqual([
      { itemGuid: SWORD, seenAt: 4000, spell: 7000 },
      { itemGuid: SWORD, seenAt: 1500, spell: 7001 },
    ]);
  });

  test("proficiency reports the bits that are new and keeps weapon and armour apart", () => {
    const slice = new TimerSlice();
    expect(slice.proficiency({ itemClass: 2, mask: 0b101 })).toEqual({
      added: 0b101,
      kind: "weapon",
    });
    expect(slice.proficiency({ itemClass: 2, mask: 0b111 })).toEqual({
      added: 0b010,
      kind: "weapon",
    });
    expect(slice.proficiency({ itemClass: 4, mask: 0b10 })).toEqual({
      added: 0b10,
      kind: "armor",
    });
    expect(slice.snapshot().proficiency).toEqual({
      armor: 0b10,
      weapon: 0b111,
    });
  });

  test("a proficiency packet for another item class changes nothing", () => {
    const slice = new TimerSlice();
    expect(slice.proficiency({ itemClass: 1, mask: 1 })).toBeUndefined();
    expect(slice.snapshot().proficiency).toEqual({
      armor: "unknown",
      weapon: "unknown",
    });
  });

  test("snapshots are copies and clear empties everything", () => {
    const slice = new TimerSlice();
    slice.time({ itemGuid: SWORD, seconds: 5 }, 0);
    slice.snapshot().timers.length = 0;
    expect(slice.snapshot().timers).toHaveLength(1);
    slice.proficiency({ itemClass: 2, mask: 1 });
    slice.clear();
    expect(slice.snapshot()).toEqual(new TimerSlice().snapshot());
  });
});

describe("items timer packets on the wire", () => {
  test("each timer opcode reaches the store and ends in state", () => {
    const world = itemsWorld(ME);
    world.put(255, 23, { entry: 25, guid: SWORD });
    const rig = itemsRig(world);
    const events: ItemsEvent[] = [];
    rig.stores.areas.items.onEvent((event) => events.push(event));
    try {
      rig.inject(
        GameOpcode.SMSG_ITEM_COOLDOWN,
        itemsItemCooldownBody(SWORD, 9),
      );
      rig.inject(
        GameOpcode.SMSG_ITEM_TIME_UPDATE,
        itemsItemTimeUpdateBody(SWORD, 30),
      );
      rig.inject(
        GameOpcode.SMSG_ITEM_ENCHANT_TIME_UPDATE,
        itemsItemEnchantTimeUpdateBody({
          item: SWORD,
          player: ME,
          seconds: 60,
          slot: 1,
        }),
      );
      rig.inject(GameOpcode.SMSG_DURABILITY_DAMAGE_DEATH, new Uint8Array());
      rig.inject(
        GameOpcode.SMSG_SET_PROFICIENCY,
        itemsSetProficiencyBody(4, 0b10),
      );
      expect(events.map((event) => event.type)).toEqual([
        "item_cooldown",
        "item_timer",
        "item_enchant_timer",
        "durability_loss_death",
        "proficiency_changed",
      ]);
      const state = rig.handle.state().timers;
      expect(state.cooldowns).toHaveLength(1);
      expect(state.timers[0]?.seconds).toBe(30);
      expect(state.enchants[0]?.slot).toBe(1);
      expect(state.proficiency).toEqual({ armor: 0b10, weapon: "unknown" });
    } finally {
      rig.dispose();
    }
  });
});
