import { describe, expect, test } from "bun:test";
import type {
  NamedInventorySlot,
  QuestLogSlot,
  QuestQuery,
  SpellDefinition,
} from "@peon/core";
import { formatLogRows, JOURNAL_LOG_LIMIT } from "#harness/log/query";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createRunRegistry } from "#harness/runs/registry";
import { journalTool } from "#harness/tools/journal";
import { createTestRuntime } from "#test-support/runtime-fixture";
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
  return { handle, rt, tool: journalTool(rt) };
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

  test("bags gives money, free slots, equipped items and bag items", async () => {
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
    handle.getInventoryState = () => ({
      ...inventory,
      coinage: 12_345,
      freeSlots: 12,
      slots,
    });
    const out = await runTool(tool, { about: "bags" });
    expect(out.text).toBe(
      [
        "DONE Money: 1g 23s 45c. 12 free bag slots.",
        "Equipped: main hand Worn Shortsword.",
        "Bags: Tough Jerky x4, Refreshing Spring Water x2.",
      ].join("\n"),
    );
    expect(out.details.result.after).toMatchObject({
      about: "bags",
      bags: { equipped: [{ name: "Worn Shortsword", slot: "main_hand" }] },
    });
  });

  test("a long bag list labels each continuation line", async () => {
    const { handle, tool } = await world();
    const inventory = handle.getInventoryState();
    const names = [
      "Jerky",
      "Water",
      "Fang",
      "Meat",
      "Collar",
      "Ear",
      "Tail",
      "Pelt",
    ];
    const slots: NamedInventorySlot[] = names.map((name, index) => ({
      bag: 255,
      guid: BigInt(index + 1),
      item: bagItem(BigInt(index + 1), 100 + index, name, 1),
      region: "backpack",
      slot: 23 + index,
      status: "occupied",
    }));
    handle.getInventoryState = () => ({ ...inventory, freeSlots: 4, slots });
    const out = await runTool(tool, { about: "bags" });
    expect(out.text.split("\n").slice(2)).toEqual([
      "Bags: Jerky x1, Water x1, Fang x1, Meat x1, Collar x1, Ear x1.",
      "Bags (continued): Tail x1, Pelt x1.",
    ]);
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
