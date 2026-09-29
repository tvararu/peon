import { describe, expect, test } from "bun:test";
import type {
  ItemTemplate,
  NamedInventorySlot,
  QuestLogSlot,
  QuestQuery,
  SpellDefinition,
} from "@peon/core";
import { formatLogRows, JOURNAL_LOG_LIMIT } from "#harness/log/query";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createRunRegistry } from "#harness/runs/registry";
import { journalTool } from "#harness/tools/journal";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";

type KnownQuest = Extract<QuestQuery, { status: "known" }>["data"];

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

function slot(
  questId: number | undefined,
  index: number,
  flags: number,
  counters: QuestLogSlot["counters"],
): QuestLogSlot {
  return { counters, expiresAtSeconds: undefined, flags, questId, slot: index };
}

const target = (count: number) => ({
  count,
  encodedNpcOrGoId: 15_274,
  itemDropId: 0,
  npcOrGoId: 15_274,
  unknownSourceCount: 0,
});
const reclaiming = {
  level: 4,
  objectives: "Kill 8 Mana Wyrms.",
  objectiveTexts: ["Mana Wyrm slain", "", "", ""],
  targets: [target(8), target(0), target(0), target(0)],
  title: "Reclaiming Sunstrider Isle",
} as unknown as KnownQuest;

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

describe("journal", () => {
  test("quests lists the log with ids, objectives and status", async () => {
    const { handle, tool } = await world();
    const state = handle.getQuestState();
    const slots = [
      slot(8325, 0, 0, [3, undefined, undefined, undefined]),
      slot(8326, 1, 1, [0, 0, 0, 0]),
      slot(undefined, 2, 0, [0, 0, 0, 0]),
    ];
    const queries: QuestQuery[] = [
      { data: reclaiming, questId: 8325, receivedAt: 0, status: "known" },
    ];
    handle.getQuestState = () => ({
      ...state,
      items: [],
      log: { complete: true, slots },
      queries,
    });
    const out = await runTool(tool, { about: "quests" });
    expect(out.text).toBe(
      [
        "DONE 2 quests. This is your quest log. To see what an NPC offers, use interact.",
        "#8325 Reclaiming Sunstrider Isle (L4): Mana Wyrm slain 3/8; incomplete.",
        '#8326 quest 8326: complete. Turn in to the NPC named in the goal; try look(find: "questgiver").',
      ].join("\n"),
    );
    expect(out.details.result.after).toMatchObject({
      about: "quests",
      quests: [{ id: 8325, turnIn: undefined }, { id: 8326 }],
    });
  });

  test("bags names each row position and id", async () => {
    const { handle, tool } = await world();
    const inventory = handle.getInventoryState();
    const slots: NamedInventorySlot[] = [
      {
        bag: 255,
        guid: 1n,
        item: bagItem(1n, 25, "Worn Shortsword", 1),
        region: "equipment",
        slot: 15,
        status: "occupied",
      },
      {
        bag: 255,
        guid: 2n,
        item: bagItem(2n, 117, "Tough Jerky", 4),
        region: "backpack",
        slot: 23,
        status: "occupied",
      },
      {
        bag: 255,
        guid: 3n,
        item: bagItem(3n, 159, "Refreshing Spring Water", 2),
        region: "backpack",
        slot: 24,
        status: "occupied",
      },
      { bag: 255, region: "backpack", slot: 25, status: "empty" },
    ];
    const queries: Record<number, ItemTemplate> = {
      25: template(25, {})[1],
      117: template(117, {})[1],
      159: template(159, {})[1],
    };
    handle.getInventoryState = () => ({
      ...inventory,
      coinage: 12_345,
      freeSlots: 12,
      slots,
    });
    handle.getItemTemplate = (entry) => Promise.resolve(queries[entry]);
    const out = await runTool(tool, { about: "bags" });
    expect(out.text).toBe(
      [
        "DONE Money: 1g 23s 45c. 12 free bag slots.",
        "Equipped: main hand Worn Shortsword.",
        "bag 255 slot 23: Tough Jerky x4 (item 117).",
        "bag 255 slot 24: Refreshing Spring Water x2 (item 159).",
      ].join("\n"),
    );
    expect(out.details.result.after).toMatchObject({
      about: "bags",
      bags: {
        equipped: [{ name: "Worn Shortsword", slot: "main_hand" }],
        items: [
          { bag: 255, entry: 117, name: "Tough Jerky", slot: 23 },
          { bag: 255, entry: 159, name: "Refreshing Spring Water", slot: 24 },
        ],
      },
    });
  });

  test("bags marks what the character can wear and what is an upgrade", async () => {
    const { handle, tool } = await world();
    const inventory = handle.getInventoryState();
    const slots: NamedInventorySlot[] = [
      {
        bag: 255,
        guid: 1n,
        item: bagItem(1n, 25, "Worn Shortsword", 1),
        region: "equipment",
        slot: 15,
        status: "occupied",
      },
      {
        bag: 255,
        guid: 2n,
        item: bagItem(2n, 36, "Sturdy Axe", 1),
        region: "backpack",
        slot: 23,
        status: "occupied",
      },
      {
        bag: 255,
        guid: 3n,
        item: bagItem(3n, 37, "Grand Sword", 1),
        region: "backpack",
        slot: 24,
        status: "occupied",
      },
      {
        bag: 255,
        guid: 4n,
        item: bagItem(4n, 38, "Mage Robe", 1),
        region: "backpack",
        slot: 25,
        status: "occupied",
      },
    ];
    const queries: Record<number, ItemTemplate> = {
      25: template(25, { inventoryType: 13, itemLevel: 2 })[1],
      36: template(36, { inventoryType: 13, itemLevel: 5 })[1],
      37: template(37, {
        inventoryType: 13,
        itemLevel: 6,
        requiredLevel: 20,
      })[1],
      38: template(38, {
        allowableClass: 0x80,
        inventoryType: 4,
        itemLevel: 6,
      })[1],
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
      "bag 255 slot 23: Sturdy Axe x1 (item 36): can wear, upgrade (item level 5, worn 2).",
      "bag 255 slot 24: Grand Sword x1 (item 37): cannot wear (needs level 20).",
      "bag 255 slot 25: Mage Robe x1 (item 38): cannot wear (class).",
    ]);
  });

  test("bags shows low durability, time left and loaded ammo", async () => {
    const { handle, tool } = await world();
    const inventory = handle.getInventoryState();
    const slots: NamedInventorySlot[] = [
      {
        bag: 255,
        guid: 1n,
        item: {
          ...bagItem(1n, 25, "Worn Shield", 1),
          durability: 5,
          maxDurability: 40,
        },
        region: "equipment",
        slot: 14,
        status: "occupied",
      },
      {
        bag: 255,
        guid: 2n,
        item: { ...bagItem(2n, 5332, "Honorless Target", 1), duration: 5400 },
        region: "backpack",
        slot: 23,
        status: "occupied",
      },
      {
        bag: 255,
        guid: 3n,
        item: bagItem(3n, 2512, "Rough Arrow", 200),
        region: "backpack",
        slot: 24,
        status: "occupied",
      },
    ];
    const queries: Record<number, ItemTemplate> = {
      25: template(25, {})[1],
      2512: template(2512, {})[1],
      5332: template(5332, {})[1],
    };
    handle.getInventoryState = () => ({
      ...inventory,
      ammoId: 2512,
      coinage: 100,
      freeSlots: 13,
      slots,
    });
    handle.getItemTemplate = (entry) => Promise.resolve(queries[entry]);
    const out = await runTool(tool, { about: "bags" });
    expect(out.text.split("\n").slice(2)).toEqual([
      "bag 255 slot 23: Honorless Target x1 (item 5332): 1h 30m left.",
      "bag 255 slot 24: Rough Arrow x200 (item 2512): loaded ammo.",
      "Ammo: Rough Arrow (item 2512).",
    ]);
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

  test("bags omits the buyback line when nothing was sold", async () => {
    const { tool } = await world();
    const out = await runTool(tool, { about: "bags" });
    expect(out.text).not.toContain("Buyback:");
  });

  test("spells lists known spells by name with cost and cooldown", async () => {
    const { handle, tool } = await world();
    const spell = (
      id: number,
      name: string,
      cost: number,
      cooldownMs: number,
    ) =>
      ({
        cooldown: { recoveryTimeMs: cooldownMs },
        id,
        name,
        power: { costRaw: cost },
        rank: "Rank 1",
      }) as unknown as SpellDefinition;
    handle.getSpellbook = () =>
      Promise.resolve([
        spell(585, "Smite", 6, 0),
        spell(2050, "Lesser Heal", 30, 0),
        spell(17, "Power Word: Shield", 45, 4000),
      ]);
    expect((await runTool(tool, { about: "spells" })).text).toBe(
      [
        "DONE 3 spells known.",
        "Lesser Heal (Rank 1): costs 30.",
        "Power Word: Shield (Rank 1): costs 45, cooldown 4 s.",
        "Smite (Rank 1): costs 6.",
      ].join("\n"),
    );
  });

  test("log shows rows since the turn started, oldest first", async () => {
    const { rt, tool } = await world();
    rt.session.turnStartSeq = rt.log.lastSeq();
    const kill = rt.log.append({
      class: "passive",
      data: {},
      domain: "combat",
      event: "combat/kill_credit",
      text: "kill credit Springpaw Stalker, +108 XP",
    });
    const item = rt.log.append({
      class: "passive",
      data: {},
      domain: "loot",
      event: "loot/item",
      text: "item Lynx Meat x1 (now 1)",
    });
    const out = await runTool(tool, { about: "log" });
    expect(out.text).toStartWith("DONE ");
    for (const line of formatLogRows([kill, item], NOW))
      expect(out.text).toContain(line);
    expect(out.details.result.after).toMatchObject({ about: "log" });
  });

  test("log says how many older rows it left out", async () => {
    const { rt, tool } = await world();
    rt.session.turnStartSeq = rt.log.lastSeq();
    for (let i = 0; i < 20; i++)
      rt.log.append({
        class: "log",
        data: {},
        domain: "chat",
        event: "chat/in",
        text: `line ${i}`,
      });
    const out = await runTool(tool, { about: "log" });
    expect(out.text.split("\n").at(-1)).toMatch(
      /^\+\d+ more; narrow with find or since\.$/,
    );
    expect(out.text.split("\n")).toHaveLength(1 + JOURNAL_LOG_LIMIT + 1);
  });
});
