import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type {
  InteractAfter,
  JournalAfter,
  LootAfter,
} from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
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

const done = <A>(after: A, detail: string): ToolResult<A> => ({
  after,
  body: [],
  detail,
  status: "DONE",
});

describe("card family", () => {
  test("call lines", () => {
    expect(
      renderCallLine("interact", { do: "turn_in", npc: "u3", what: "2" }),
    ).toBe(`${nerd.questgiver} interact u3 turn_in 2`);
    expect(renderCallLine("loot", {})).toBe(`${nerd.loot} loot nearest corpse`);
    expect(renderCallLine("journal", { about: "log", since: "r4" })).toBe(
      `${nerd.questLog} journal log r4`,
    );
  });

  test("interact talk lists offers and the Last money line", () => {
    const text = plain(
      renderResultLines(
        "interact",
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

  test("loot paints items in their quality colour", () => {
    const lines = renderResultLines(
      "loot",
      done(looted, "looted 2 items and 75 copper."),
    );
    expect(plain(lines)[1]).toBe(`${nerd.lootable} Springpaw Stalker u9`);
    expect(plain(lines)[2]).toBe(`${nerd.loot} Dragonhawk Egg ×1`);
    expect(painted(theme, "success", lines[3] ?? "")).toBe(true);
  });

  test("journal log shows the range label, timeline rows and the rest count", () => {
    const text = plain(renderResultLines("journal", done(log, "1 row.")));
    expect(text.slice(1)).toEqual([
      "since r4 started (1m 12s ago)",
      `${hms(at)} ${nerd.death} You died › Springpaw Stalker L7`,
      "+3 more",
    ]);
  });

  test("journal quests is a tracker with turn-in hints", () => {
    const text = plain(
      renderResultLines("journal", done(quests, "2 quests."), {
        options: open,
      }),
    );
    expect(text[1]).toBe(
      `${nerd.questComplete} Unfortunate Measures [2] → ${nerd.questgiver} Magistrix Erona`,
    );
    expect(text[4]).toBe("  3/8 Springpaw Cub slain");
  });

  test("card results fit a 40-column pane", () => {
    const all = [
      renderResultLines("interact", done(talk, "x"), {
        options: open,
        width: 40,
      }),
      renderResultLines("journal", done(quests, "x"), {
        options: open,
        width: 40,
      }),
    ];
    for (const line of all.flat())
      expect(visibleWidth(line)).toBeLessThanOrEqual(40);
  });
});
