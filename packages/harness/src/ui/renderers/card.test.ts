import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type {
  InteractAfter,
  JournalAfter,
  LootAfter,
} from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import { emptyUnit } from "#harness/tools/define";
import { interactTool } from "#harness/tools/interact";
import { journalTool } from "#harness/tools/journal";
import { lootTool } from "#harness/tools/loot";
import { hms } from "#harness/ui/draw";
import { nerd } from "#harness/ui/glyphs";
import {
  open,
  renderCallLine,
  renderResultLines,
} from "#test-support/render-fixture";
import {
  painted,
  plain,
  testTheme,
  unitFixture,
} from "#test-support/ui-fixture";

const theme = testTheme();
const npc = unitFixture({
  name: "Magistrix Erona",
  ref: "u3",
  relation: "friendly",
  roles: ["questgiver"],
  targetsMe: false,
});

const talk: InteractAfter = {
  action: "talk",
  bought: undefined,
  dialogOpened: true,
  freeSlots: 11,
  gossip: [],
  learned: [],
  money: { after: 4975, before: 5075 },
  npc,
  offers: [
    {
      id: 8325,
      level: 1,
      line: 1,
      state: "available",
      title: "Reclaiming Sunstrider Isle",
    },
    {
      id: 8326,
      level: 2,
      line: 2,
      state: "ready",
      title: "Unfortunate Measures",
    },
  ],
  repairCost: undefined,
  rewardChoices: [],
  roles: ["questgiver"],
  sold: [],
  spells: [],
  stock: [],
};

const looted: LootAfter = {
  copper: 75,
  corpse: unitFixture({ alive: false, lootable: true }),
  freeSlots: 10,
  items: [
    { count: 1, itemId: 2966, name: "Dragonhawk Egg", quality: 1 },
    { count: 1, itemId: 20_797, name: "Lynx Collar", quality: 2 },
  ],
  windowClosed: true,
};

const at = new Date(2026, 8, 26, 19, 20, 11).getTime();

const log: JournalAfter = {
  about: "log",
  label: "since r4 started (1m 12s ago)",
  more: 3,
  rows: [
    {
      char: "Fgklibhlflc",
      class: "wake",
      data: {},
      domain: "life",
      event: "life/dead",
      seq: 90,
      text: "You died › Springpaw Stalker L7",
      ts: at,
      v: 1,
    },
  ],
};

const quests: JournalAfter = {
  about: "quests",
  quests: [
    {
      id: 8326,
      level: 2,
      objectives: [{ count: 8, required: 8, text: "Mana Wyrm slain" }],
      status: "complete",
      title: "Unfortunate Measures",
      turnIn: "Magistrix Erona",
    },
    {
      id: 8325,
      level: 1,
      objectives: [{ count: 3, required: 8, text: "Springpaw Cub slain" }],
      status: "incomplete",
      title: "Reclaiming Sunstrider Isle",
      turnIn: undefined,
    },
  ],
};

const spells: JournalAfter = {
  about: "spells",
  auras: [
    { name: "Arcane Intellect", spellId: 1459 },
    { name: "Mana Shield", spellId: 1463 },
  ],
  bar: [
    { id: 133, name: "Fireball", slot: 0, type: "spell" },
    { id: 4540, name: "Tough Jerky", slot: 3, type: "item" },
  ],
  spells: [
    { cooldownMs: 30_000, cost: 55, id: 133, name: "Fireball", rank: "Rank 1" },
    {
      cooldownMs: undefined,
      cost: undefined,
      id: 168,
      name: "Frost Armor",
      rank: undefined,
    },
  ],
};

const bags: JournalAfter = {
  about: "bags",
  bags: {
    ammo: { entry: 2512, name: "Rough Arrow" },
    copper: 12_345,
    equipped: [
      {
        durability: { current: 40, max: 50 },
        name: "Apprentice's Robe",
        quality: 1,
        slot: "chest",
      },
      { durability: undefined, name: "Frayed Cloak", quality: 1, slot: "back" },
    ],
    freeSlots: 11,
    items: [
      {
        bag: 0,
        canWear: true,
        count: 1,
        durability: undefined,
        entry: 4540,
        kind: "other",
        loadedAmmo: false,
        name: "Silk Belt",
        quality: 2,
        requiredLevel: undefined,
        secondsLeft: undefined,
        slot: 1,
        upgrade: { itemLevel: 9, wornItemLevel: 4 },
      },
      {
        bag: 0,
        canWear: undefined,
        count: 200,
        durability: undefined,
        entry: 2512,
        kind: "other",
        loadedAmmo: true,
        name: "Rough Arrow",
        quality: 1,
        requiredLevel: undefined,
        secondsLeft: 90,
        slot: 2,
        upgrade: undefined,
      },
      {
        bag: 1,
        canWear: false,
        count: 1,
        durability: { current: 3, max: 30 },
        entry: 3208,
        kind: "other",
        loadedAmmo: false,
        name: "Dented Plate Helm",
        quality: 1,
        requiredLevel: 8,
        secondsLeft: undefined,
        slot: 4,
        upgrade: undefined,
      },
    ],
  },
};

const done = <A>(after: A, detail: string): ToolResult<A> => ({
  after,
  body: [],
  detail,
  status: "DONE",
});

describe("card family", () => {
  test("call lines", () => {
    expect(
      renderCallLine(interactTool, { do: "turn_in", npc: "u3", what: "2" }),
    ).toBe(`${nerd.questgiver} interact u3 turn_in 2`);
    expect(renderCallLine(lootTool, {})).toBe(
      `${nerd.loot} loot nearest corpse`,
    );
    expect(renderCallLine(journalTool, { about: "log", since: "r4" })).toBe(
      `${nerd.questLog} journal log r4`,
    );
  });

  test("interact talk lists offers and the Last money line", () => {
    const text = plain(
      renderResultLines(
        interactTool,
        done(talk, "Magistrix Erona offers 2 quests."),
        { options: open },
      ),
    );
    expect(text[1]).toBe(`${nerd.questgiver} Magistrix Erona u3 questgiver`);
    expect(text[2]).toBe(
      `${nerd.questAvailable} 1. Reclaiming Sunstrider Isle [1]`,
    );
    expect(text[3]).toBe(`${nerd.questComplete} 2. Unfortunate Measures [2]`);
    expect(text[4]).toBe(
      `Last: ${nerd.silver}49 ${nerd.copper}75 (-${nerd.silver}1 ${nerd.copper}0)`,
    );
  });

  test("a failed interact with no resolved NPC draws no lone skull", () => {
    const failed: ToolResult<InteractAfter> = {
      after: { ...talk, money: undefined, npc: emptyUnit(), offers: [] },
      body: [],
      detail: "target_not_observed: could not reach Magistrix Erona (u1).",
      next: 'travel(to: "u1")',
      status: "FAILED",
    };
    const text = plain(renderResultLines(interactTool, failed));
    expect(text.join("\n")).not.toContain(nerd.dead);
    expect(text.filter((line) => line.trim() === "")).toHaveLength(0);
  });

  test("the turn-in card shows the money reward, not a zero delta", () => {
    const turnIn = (before: number, after: number) =>
      plain(
        renderResultLines(
          interactTool,
          done(
            { ...talk, action: "turn_in", money: { after, before } },
            "turned in Reclaiming Sunstrider Isle #8325.",
          ),
          { options: open },
        ),
      );
    expect(turnIn(0, 30)).toContain(
      `Reward: +${nerd.copper}30 · Last: ${nerd.copper}30`,
    );
    const none = turnIn(0, 0);
    expect(none).toContain(`Last: ${nerd.copper}0`);
    expect(none.join("\n")).not.toContain("(+");
  });

  test("loot paints items in their quality colour", () => {
    const lines = renderResultLines(
      lootTool,
      done(looted, "looted 2 items and 75 copper."),
    );
    expect(plain(lines)[1]).toBe(`${nerd.lootable} Springpaw Stalker u9`);
    expect(plain(lines)[2]).toBe(`${nerd.loot} Dragonhawk Egg ×1`);
    expect(painted(theme, "success", lines[3] ?? "")).toBe(true);
  });

  test("journal log shows the range label, timeline rows and the rest count", () => {
    const text = plain(renderResultLines(journalTool, done(log, "1 row.")));
    expect(text.slice(1)).toEqual([
      "since r4 started (1m 12s ago)",
      `${hms(at)} ${nerd.death} You died › Springpaw Stalker L7`,
      "+3 more",
    ]);
  });

  test("journal quests is a tracker with turn-in hints", () => {
    const text = plain(
      renderResultLines(journalTool, done(quests, "2 quests."), {
        options: open,
      }),
    );
    expect(text[1]).toBe(
      `${nerd.questComplete} Unfortunate Measures [2] → ${nerd.questgiver} Magistrix Erona`,
    );
    expect(text[4]).toBe("  3/8 Springpaw Cub slain");
  });

  test("journal spells lists cost, cooldown, auras and the action bar", () => {
    const text = plain(
      renderResultLines(journalTool, done(spells, "2 spells known."), {
        options: open,
      }),
    );
    expect(text.slice(1)).toEqual([
      `${nerd.spell} Fireball (Rank 1) 55 · 30s`,
      `${nerd.spell} Frost Armor`,
      "Auras",
      `${nerd.buff} Arcane Intellect`,
      `${nerd.buff} Mana Shield`,
      "Bar",
      `0 ${nerd.spell} Fireball`,
      `3 ${nerd.item} Tough Jerky`,
    ]);
  });

  test("journal spells with no auras or bar draws no empty headings", () => {
    const bare: JournalAfter = { ...spells, auras: [], bar: [] };
    const text = plain(
      renderResultLines(journalTool, done(bare, "2 spells known."), {
        options: open,
      }),
    ).join("\n");
    expect(text).not.toContain("Auras");
    expect(text).not.toContain("Bar");
  });

  test("journal bags shows worn durability, item marks and ammo", () => {
    const text = plain(
      renderResultLines(journalTool, done(bags, "Money."), { options: open }),
    );
    expect(text.slice(1)).toEqual([
      `${nerd.gold}1 ${nerd.silver}23 ${nerd.copper}45  ${nerd.bag} 11 free`,
      `${nerd.item} Silk Belt ×1 other · upgrade`,
      `${nerd.item} Rough Arrow ×200 other · loaded, 1m left`,
      `${nerd.item} Dented Plate Helm ×1 other · needs level 8, low dura 3/30`,
      `chest Apprentice's Robe 40/50`,
      "back Frayed Cloak",
      "Ammo Rough Arrow",
    ]);
  });

  test("an empty bags journal draws no blank row", () => {
    const empty: JournalAfter = {
      about: "bags",
      bags: {
        ammo: undefined,
        copper: undefined,
        equipped: [],
        freeSlots: undefined,
        items: [],
      },
    };
    const text = plain(
      renderResultLines(journalTool, done(empty, "Bags empty."), {
        options: open,
      }),
    );
    expect(text.filter((line) => line.trim() === "")).toHaveLength(0);
  });

  test("card results fit a 40-column pane", () => {
    const all = [
      renderResultLines(interactTool, done(talk, "x"), {
        options: open,
        width: 40,
      }),
      renderResultLines(journalTool, done(quests, "x"), {
        options: open,
        width: 40,
      }),
    ];
    for (const line of all.flat())
      expect(visibleWidth(line)).toBeLessThanOrEqual(40);
  });
});
