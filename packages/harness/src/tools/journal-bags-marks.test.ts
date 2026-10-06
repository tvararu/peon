import { describe, expect, test } from "bun:test";
import type { ItemTemplate, NamedInventorySlot } from "@peon/core";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createRunRegistry } from "#harness/runs/registry";
import { journalTool } from "#harness/tools/journal";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";

const NOW = 1_000_000;

async function world() {
  const clock = { now: () => NOW };
  const log = createGameLog({
    char: () => "Fgklibhlflc",
    clock,
    file: undefined,
  });
  const runs = createRunRegistry({
    clock,
    log,
    sink: createJsonlSink({ file: undefined }),
  });
  const { handle, rt } = await createTestRuntime({
    parts: { clock, log, runs },
  });
  return { handle, rt, tool: journalTool.definition(rt) };
}

function bagItem(guid: bigint, entry: number, name: string, count: number) {
  return {
    contained: undefined,
    count,
    durability: undefined,
    entry,
    flags: undefined,
    guid,
    maxDurability: undefined,
    name,
    owner: undefined,
    quality: 1,
    randomPropertyId: undefined,
  };
}

function template(
  entry: number,
  init: Partial<ItemTemplate>,
): [number, ItemTemplate] {
  return [
    entry,
    {
      allowableClass: 0xff_ff_ff_ff,
      allowableRace: 0xff_ff_ff_ff,
      ammoType: 0,
      armor: 0,
      bagFamily: 0,
      bonding: 0,
      containerSlots: 0,
      damage: [],
      delay: 0,
      duration: 0,
      entry,
      flags: 0,
      gemProperties: 0,
      inventoryType: 0,
      itemClass: 0,
      itemLevel: 1,
      itemSet: 0,
      limitCategory: 0,
      lockId: 0,
      maxCount: 0,
      maxDurability: 0,
      name: `item ${entry}`,
      pageText: 0,
      quality: 1,
      requiredLevel: 0,
      requiredSkill: 0,
      requiredSkillRank: 0,
      requiredSpell: 0,
      resistances: {
        arcane: 0,
        fire: 0,
        frost: 0,
        holy: 0,
        nature: 0,
        shadow: 0,
      },
      socketBonus: 0,
      sockets: [],
      spells: [],
      stackSize: 1,
      stats: [],
      subclass: 0,
      ...init,
    },
  ];
}

function leveled(handle: MockHandle) {
  handle.getSelfClass = () => "Warrior";
  handle.getExperienceState = () => ({
    lastLevelUp: undefined,
    lastXp: undefined,
    level: 10,
    nextLevelXp: undefined,
    xp: undefined,
  });
}

describe("journal bags marks", () => {
  test("bags leaves non-equippable items unmarked", async () => {
    const { handle, tool } = await world();
    const inventory = handle.getInventoryState();
    const slots: NamedInventorySlot[] = [
      {
        bag: 255,
        guid: 2n,
        item: bagItem(2n, 6948, "Hearthstone", 1),
        region: "backpack",
        slot: 23,
        status: "occupied",
      },
    ];
    const queries: Record<number, ItemTemplate> = {
      6948: template(6948, { inventoryType: 0 })[1],
    };
    handle.getInventoryState = () => ({
      ...inventory,
      coinage: 12_345,
      freeSlots: 15,
      slots,
    });
    handle.getItemTemplate = (entry) => Promise.resolve(queries[entry]);
    leveled(handle);
    const out = await runTool(tool, { about: "bags" });
    expect(out.text.split("\n").slice(2)).toEqual([
      "bag 255 slot 23: Hearthstone x1 (item 6948).",
    ]);
  });

  test("bags compares a carried bag against the equipped bag slots", async () => {
    const { handle, tool } = await world();
    const inventory = handle.getInventoryState();
    const slots: NamedInventorySlot[] = [
      {
        bag: 255,
        guid: 1n,
        item: bagItem(1n, 4492, "Small Brown Pouch", 1),
        region: "bag",
        slot: 19,
        status: "occupied",
      },
      {
        bag: 19,
        guid: 2n,
        item: bagItem(2n, 4496, "Brown Leather Satchel", 1),
        region: "bag_item",
        slot: 0,
        status: "occupied",
      },
    ];
    const queries: Record<number, ItemTemplate> = {
      4492: template(4492, { containerSlots: 6, inventoryType: 18 })[1],
      4496: template(4496, { containerSlots: 10, inventoryType: 18 })[1],
    };
    handle.getInventoryState = () => ({
      ...inventory,
      coinage: 12_345,
      freeSlots: 9,
      slots,
    });
    handle.getItemTemplate = (entry) => Promise.resolve(queries[entry]);
    leveled(handle);
    const out = await runTool(tool, { about: "bags" });
    expect(out.text.split("\n").slice(2)).toEqual([
      "bag 19 slot 0: Brown Leather Satchel x1 (item 4496): can wear, upgrade (item level 10, worn 6).",
    ]);
  });

  test("bags shows low durability without a template", async () => {
    const { handle, tool } = await world();
    const inventory = handle.getInventoryState();
    const slots: NamedInventorySlot[] = [
      {
        bag: 255,
        guid: 2n,
        item: {
          ...bagItem(2n, 12_345, "Scuffed Blade", 1),
          durability: 5,
          maxDurability: 40,
        },
        region: "backpack",
        slot: 23,
        status: "occupied",
      },
    ];
    handle.getInventoryState = () => ({
      ...inventory,
      coinage: 12_345,
      freeSlots: 15,
      slots,
    });
    handle.getItemTemplate = () => Promise.resolve(undefined);
    const out = await runTool(tool, { about: "bags" });
    expect(out.text.split("\n").slice(2)).toEqual([
      "bag 255 slot 23: Scuffed Blade x1 (item 12345): durability 5/40.",
    ]);
  });

  test("bags keeps every position retrievable with a full inventory", async () => {
    const { handle, tool } = await world();
    const inventory = handle.getInventoryState();
    const slots: NamedInventorySlot[] = [];
    for (let at = 23; at <= 38; at++)
      slots.push({
        bag: 255,
        guid: BigInt(at),
        item: bagItem(BigInt(at), 1000 + at, `Backpack Item ${at}`, 1),
        region: "backpack",
        slot: at,
        status: "occupied",
      });
    for (let bag = 19; bag <= 22; bag++)
      for (let at = 0; at <= 35; at++)
        slots.push({
          bag,
          guid: BigInt(bag * 100 + at),
          item: bagItem(
            BigInt(bag * 100 + at),
            2000 + bag * 40 + at,
            `Satchel Item ${bag}-${at}`,
            1,
          ),
          region: "bag_item",
          slot: at,
          status: "occupied",
        });
    handle.getInventoryState = () => ({
      ...inventory,
      coinage: 12_345,
      freeSlots: 0,
      slots,
    });
    handle.getItemTemplate = (entry) => Promise.resolve(template(entry, {})[1]);
    leveled(handle);
    const out = await runTool(tool, { about: "bags" });
    const lines = out.text.split("\n");
    expect(lines.length).toBeLessThanOrEqual(24);
    for (const row of slots)
      if (row.status === "occupied")
        expect(out.text).toContain(
          `bag ${row.bag} slot ${row.slot} ${row.item.name} x1 (item ${row.item.entry})`,
        );
  });

  test("bags ends with a buyback line when the vendor holds sold items", async () => {
    const { handle, tool } = await world();
    const sold = {
      ...handle.buyback.state(),
      list: [
        { count: 1, entry: 2589, guid: 0x77n, price: 35, slot: 74, soldAt: 10 },
      ],
    };
    Object.assign(handle, {
      buyback: { ...handle.buyback, state: () => sold },
    });
    handle.itemLabel = (() => ({
      name: "Linen Cloth",
      quality: 1,
    })) as typeof handle.itemLabel;
    const out = await runTool(tool, { about: "bags" });
    expect(out.text.split("\n").at(-1)).toBe(
      "Buyback: Linen Cloth x1 for 35 copper.",
    );
  });

  test("bags keeps the buyback line when more than 21 item rows trigger compact", async () => {
    const { handle, tool } = await world();
    const inventory = handle.getInventoryState();
    const slots: NamedInventorySlot[] = [];
    for (let at = 0; at < 22; at++)
      slots.push({
        bag: 19,
        guid: BigInt(at + 1),
        item: bagItem(BigInt(at + 1), 3000 + at, `Bag Item ${at}`, 1),
        region: "bag_item",
        slot: at,
        status: "occupied",
      });
    handle.getInventoryState = () => ({ ...inventory, slots });
    handle.getItemTemplate = (entry) => Promise.resolve(template(entry, {})[1]);
    leveled(handle);
    const sold = {
      ...handle.buyback.state(),
      list: [
        { count: 1, entry: 2589, guid: 0x77n, price: 35, slot: 74, soldAt: 10 },
      ],
    };
    Object.assign(handle, {
      buyback: { ...handle.buyback, state: () => sold },
    });
    handle.itemLabel = (() => ({
      name: "Linen Cloth",
      quality: 1,
    })) as typeof handle.itemLabel;
    const out = await runTool(tool, { about: "bags" });
    const lines = out.text.split("\n");
    expect(lines.some((line) => line.startsWith("bag 19: "))).toBe(true);
    expect(lines.at(-1)).toBe("Buyback: Linen Cloth x1 for 35 copper.");
  });

  test("bags names the level only for a level restriction", async () => {
    const { handle, tool } = await world();
    const inventory = handle.getInventoryState();
    const slots: NamedInventorySlot[] = [
      {
        bag: 255,
        guid: 2n,
        item: bagItem(2n, 35, "Robe of the Magi", 1),
        region: "backpack",
        slot: 23,
        status: "occupied",
      },
      {
        bag: 255,
        guid: 3n,
        item: bagItem(3n, 36, "Heavy Mace", 1),
        region: "backpack",
        slot: 24,
        status: "occupied",
      },
    ];
    const queries: Record<number, ItemTemplate> = {
      35: template(35, {
        allowableClass: 0x80,
        inventoryType: 20,
        requiredLevel: 20,
      })[1],
      36: template(36, { inventoryType: 13, requiredLevel: 20 })[1],
    };
    handle.getInventoryState = () => ({
      ...inventory,
      coinage: 12_345,
      freeSlots: 14,
      slots,
    });
    handle.getItemTemplate = (entry) => Promise.resolve(queries[entry]);
    leveled(handle);
    const out = await runTool(tool, { about: "bags" });
    expect(out.text.split("\n").slice(2)).toEqual([
      "bag 255 slot 23: Robe of the Magi x1 (item 35): cannot wear (class).",
      "bag 255 slot 24: Heavy Mace x1 (item 36): cannot wear (needs level 20).",
    ]);
  });

  test("bags marks low durability on equipped gear", async () => {
    const { handle, tool } = await world();
    const inventory = handle.getInventoryState();
    const slots: NamedInventorySlot[] = [
      {
        bag: 255,
        guid: 2n,
        item: {
          ...bagItem(2n, 25, "Worn Shortsword", 1),
          durability: 5,
          maxDurability: 40,
        },
        region: "equipment",
        slot: 15,
        status: "occupied",
      },
    ];
    handle.getInventoryState = () => ({
      ...inventory,
      coinage: 12_345,
      freeSlots: 16,
      slots,
    });
    handle.getItemTemplate = () => Promise.resolve(undefined);
    const out = await runTool(tool, { about: "bags" });
    expect(out.text.split("\n")[1]).toBe(
      "Equipped: main hand Worn Shortsword (durability 5/40).",
    );
    expect(out.details.result.after).toMatchObject({
      bags: { equipped: [{ durability: { current: 5, max: 40 } }] },
    });
  });
});
