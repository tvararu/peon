import { describe, expect, test } from "bun:test";
import { itemsSetFlags } from "#test-support/areas/items";
import { itemsWorld } from "#test-support/areas/items-world";
import {
  type MoveRequest,
  moveClaim,
  moveSettled,
  positionRefusal,
} from "#wow/areas/items/moves";
import { readInventory } from "#wow/inventory";
import type { InventoryChangeFailure } from "#wow/protocol/inventory";

const ME = 0x0a_00n;
const SWORD = 0x40_00_00_00_00_00_00_01n;
const BAG = 0x40_00_00_00_00_00_00_02n;
const WATER = 0x40_00_00_00_00_00_00_03n;
const SPLIT = 0x40_00_00_00_00_00_00_04n;

function request(init: Partial<MoveRequest>): MoveRequest {
  return {
    kind: "swap",
    itemGuid: SWORD,
    entry: 25,
    from: { bag: 255, slot: 23 },
    to: undefined,
    count: 1,
    stackBefore: 1,
    target: undefined,
    requestedAt: 0,
    ...init,
  };
}

function inventory(world: ReturnType<typeof itemsWorld>) {
  return readInventory(ME, world.lookup);
}

describe("move settle rules (design 5.3)", () => {
  test("equip settles once the item sits in any equipment or bag slot", () => {
    const world = itemsWorld(ME);
    world.put(255, 23, { entry: 25, guid: SWORD });
    const equip = request({ kind: "equip" });
    expect(moveSettled(equip, inventory(world))).toBe(false);
    world.clear(255, 23);
    world.put(255, 15, { entry: 25, guid: SWORD });
    expect(moveSettled(equip, inventory(world))).toBe(true);
    const bag = request({ itemGuid: BAG, kind: "equip" });
    world.put(255, 19, { bagSlots: 6, entry: 4496, guid: BAG });
    expect(moveSettled(bag, inventory(world))).toBe(true);
  });

  test("equip_slot settles only in the named slot", () => {
    const world = itemsWorld(ME);
    world.put(255, 16, { entry: 25, guid: SWORD });
    const named = request({ kind: "equip_slot", to: { bag: 255, slot: 15 } });
    expect(moveSettled(named, inventory(world))).toBe(false);
    world.clear(255, 16);
    world.put(255, 15, { entry: 25, guid: SWORD });
    expect(moveSettled(named, inventory(world))).toBe(true);
  });

  test("unequip settles in any carried slot, or in the named bag", () => {
    const world = itemsWorld(ME);
    world.put(255, 19, { bagSlots: 6, entry: 4496, guid: BAG });
    world.put(255, 25, { entry: 25, guid: SWORD });
    const from = { bag: 255, slot: 15 };
    expect(
      moveSettled(
        request({ from, kind: "unequip", to: { bag: 0, slot: 255 } }),
        inventory(world),
      ),
    ).toBe(true);
    const named = request({
      from,
      kind: "unequip",
      to: { bag: 19, slot: 255 },
    });
    expect(moveSettled(named, inventory(world))).toBe(false);
    world.clear(255, 25);
    world.put(19, 0, { entry: 25, guid: SWORD });
    expect(moveSettled(named, inventory(world))).toBe(true);
  });

  test("unequip into a named bag settles only once the item is in that bag", () => {
    const world = itemsWorld(ME);
    world.put(255, 19, { bagSlots: 6, entry: 4496, guid: BAG });
    world.put(255, 25, { entry: 25, guid: SWORD });
    const named = request({
      from: { bag: 255, slot: 15 },
      kind: "unequip",
      to: { bag: 19, slot: 255 },
    });
    expect(moveSettled(named, inventory(world))).toBe(false);
    world.clear(255, 25);
    world.put(19, 3, { entry: 25, guid: SWORD });
    expect(moveSettled(named, inventory(world))).toBe(true);
  });

  test("swap settles when the item reaches the destination or merges into its stack", () => {
    const world = itemsWorld(ME);
    world.put(255, 23, { count: 5, entry: 159, guid: WATER });
    const to = { bag: 255, slot: 30 };
    const swap = request({ itemGuid: WATER, stackBefore: 5, to });
    expect(moveSettled(swap, inventory(world))).toBe(false);
    world.clear(255, 23);
    world.put(255, 30, { count: 5, entry: 159, guid: WATER });
    expect(moveSettled(swap, inventory(world))).toBe(true);

    const merged = itemsWorld(ME);
    merged.put(255, 24, { count: 12, entry: 159, guid: SPLIT });
    const merge = request({
      itemGuid: WATER,
      stackBefore: 5,
      target: { count: 7, guid: SPLIT },
      to: { bag: 255, slot: 24 },
    });
    expect(moveSettled(merge, inventory(merged))).toBe(true);
  });

  test("split settles when the source lost the count and the destination holds the entry", () => {
    const world = itemsWorld(ME);
    world.put(255, 23, { count: 20, entry: 159, guid: WATER });
    const split = request({
      count: 5,
      entry: 159,
      from: { bag: 255, slot: 23 },
      itemGuid: WATER,
      kind: "split",
      stackBefore: 20,
      to: { bag: 255, slot: 30 },
    });
    expect(moveSettled(split, inventory(world))).toBe(false);
    world.setCount(WATER, 15);
    expect(moveSettled(split, inventory(world))).toBe(false);
    world.put(255, 30, { count: 5, entry: 159, guid: SPLIT });
    expect(moveSettled(split, inventory(world))).toBe(true);
  });

  test("ammo settles when the loaded id equals the entry (PlayerStorage.cpp:2628-2648)", () => {
    const world = itemsWorld(ME);
    world.put(255, 23, { count: 200, entry: 2512, guid: WATER });
    const load = request({ entry: 2512, kind: "ammo" });
    expect(moveSettled(load, inventory(world))).toBe(false);
    world.setAmmo(2512);
    expect(moveSettled(load, inventory(world))).toBe(true);
    world.setAmmo(0);
    expect(
      moveSettled(request({ entry: 0, kind: "ammo" }), inventory(world)),
    ).toBe(true);
  });

  test("wrap settles on the wrapped flag of the same guid, whatever the entry becomes (ItemHandler.cpp:1163-1190)", () => {
    const world = itemsWorld(ME);
    world.put(255, 23, { entry: 25, guid: SWORD });
    world.put(255, 24, { count: 2, entry: 5042, guid: WATER });
    const wrap = request({
      kind: "wrap",
      target: { count: 1, guid: WATER },
    });
    expect(moveSettled(wrap, inventory(world))).toBe(false);
    world.put(255, 23, { entry: 5043, guid: SWORD });
    expect(moveSettled(wrap, inventory(world))).toBe(false);
    itemsSetFlags(world.entities.get(SWORD), 0x8);
    expect(moveSettled(wrap, inventory(world))).toBe(true);
  });

  test("a wrap names its own claim for either guid the failure packet carries", () => {
    const wrap = request({ kind: "wrap", target: { count: 1, guid: WATER } });
    const packet = (item1: bigint): InventoryChangeFailure => ({
      bagType: 0,
      detail: { kind: "none" },
      item1,
      item2: 0n,
      kind: "error",
      result: 15,
    });
    expect(moveClaim(wrap, packet(WATER))).toEqual({ itemGuid: WATER });
    expect(moveClaim(wrap, packet(SWORD))).toEqual({ itemGuid: SWORD });
    expect(moveClaim({ ...wrap, kind: "swap" }, packet(WATER))).toEqual({
      itemGuid: SWORD,
    });
  });

  test("bank slots, bank bags and buyback slots are refused until economy reads them", () => {
    expect(positionRefusal({ bag: 255, slot: 23 })).toBeUndefined();
    expect(positionRefusal({ bag: 19, slot: 3 })).toBeUndefined();
    for (const slot of [39, 66, 67, 73, 74, 85])
      expect(positionRefusal({ bag: 255, slot })).toBeString();
    expect(positionRefusal({ bag: 67, slot: 0 })).toBeString();
  });
});
