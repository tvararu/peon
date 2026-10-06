import { describe, expect, jest, test } from "bun:test";
import { journalTool } from "#harness/tools/journal";
import { createTestRuntime } from "#test-support/runtime-fixture";
import {
  aura,
  definition,
  FIREBALL,
  FIREBALL_SPELL,
  FROST_ARMOR_SPELL,
  installSpells,
  mountAura,
  passiveSpell,
} from "#test-support/spell-tool-fixtures";
import { runTool } from "#test-support/tool-harness";

async function world() {
  const { handle, rt } = await createTestRuntime();
  return { handle, tool: journalTool.definition(rt) };
}

describe("journal about spells", () => {
  test("hides the lower ranks the server marks inactive", async () => {
    const { handle, tool } = await world();
    const rank1 = definition({ id: 133, name: "Fireball", rank: "Rank 1" });
    const rank2 = definition({ id: 143, name: "Fireball", rank: "Rank 2" });
    installSpells(handle, {
      book: [rank1, rank2, FROST_ARMOR_SPELL],
      inactive: [133],
    });
    const out = await runTool(tool, { about: "spells" });
    expect(out.text.split("\n")).toEqual([
      "DONE 2 spells known.",
      "Fireball (Rank 2): no cost.",
      "Frost Armor (Rank 1): no cost.",
    ]);
  });

  test("adds the auras the character can cancel", async () => {
    const { handle, tool } = await world();
    const mount = mountAura();
    const curse = aura({ flags: 0x80, name: "Curse", slot: 3, spellId: 700 });
    const bond = aura({ slot: 4, spellId: 701 });
    const locked = aura({ slot: 5, spellId: 702 });
    installSpells(handle, {
      auras: [aura(), curse, bond, locked, mount.aura],
      book: [FROST_ARMOR_SPELL],
      definitions: [
        mount.spell,
        passiveSpell(701, "Innate"),
        definition({ id: 702, name: "Sealed", raw: 0x80_00_00_00 }),
      ],
    });
    const out = await runTool(tool, { about: "spells" });
    const lines = out.text.split("\n");
    expect(
      lines.some((l) => l.includes("Brown Horse") && l.includes("458")),
    ).toBe(true);
    expect(out.details.result.after).toMatchObject({
      auras: [
        { name: "Frost Armor", spellId: 168 },
        { name: "Brown Horse", spellId: 458 },
      ],
    });
  });

  test("caps the aura lines at four and counts the rest", async () => {
    const { handle, tool } = await world();
    const many = [1, 2, 3, 4, 5, 6].map((n) =>
      aura({ name: `Buff ${n}`, slot: n, spellId: 900 + n }),
    );
    installSpells(handle, { auras: many, book: [] });
    const lines = (await runTool(tool, { about: "spells" })).text.split("\n");
    expect(lines.slice(1)).toEqual([
      "Aura you can cancel: Buff 1 (spell 901).",
      "Aura you can cancel: Buff 2 (spell 902).",
      "Aura you can cancel: Buff 3 (spell 903).",
      "+3 more auras you can cancel.",
    ]);
  });

  test("lists the filled bar slots from 1 and caps them at four lines", async () => {
    const { handle, tool } = await world();
    installSpells(handle, { book: [FIREBALL_SPELL] });
    handle.getActionBar = () => [
      { id: FIREBALL, slot: 0, type: "spell" },
      { id: 6948, slot: 11, type: "item" },
    ];
    const short = (await runTool(tool, { about: "spells" })).text.split("\n");
    expect(short.slice(1, 3)).toEqual([
      "Bar slot 1: Fireball (spell 133).",
      "Bar slot 12: item 6948.",
    ]);
    handle.getActionBar = () =>
      [0, 1, 2, 3, 4].map((index) => ({
        id: FIREBALL,
        slot: index,
        type: "spell" as const,
      }));
    const long = (await runTool(tool, { about: "spells" })).text.split("\n");
    expect(long.slice(1, 5)).toEqual([
      "Bar slot 1: Fireball (spell 133).",
      "Bar slot 2: Fireball (spell 133).",
      "Bar slot 3: Fireball (spell 133).",
      "+2 more bar slots.",
    ]);
  });

  test("puts the auras and the bar before a long spell list", async () => {
    const { handle, tool } = await world();
    const book = Array.from({ length: 40 }, (_, index) =>
      definition({ id: 2000 + index, name: `Spell ${index}` }),
    );
    installSpells(handle, {
      auras: [aura()],
      book: [FROST_ARMOR_SPELL, FIREBALL_SPELL, ...book],
    });
    handle.getActionBar = () => [{ id: FIREBALL, slot: 0, type: "spell" }];
    const out = await runTool(tool, { about: "spells" });
    const lines = out.text.split("\n");
    expect(lines.slice(1, 3)).toEqual([
      "Aura you can cancel: Frost Armor (spell 168).",
      "Bar slot 1: Fireball (spell 133).",
    ]);
    expect(lines.length).toBeLessThanOrEqual(25);
  });
});

describe("journal about spells professions, totems and runes", () => {
  test("lists professions with value and max, then the totem, then the runes", async () => {
    const { handle, tool } = await world();
    installSpells(handle, { book: [FROST_ARMOR_SPELL] });
    const base = handle.spells.state();
    jest.spyOn(handle.spells, "state").mockImplementation(() => ({
      ...base,
      runes: [
        { cooldown: undefined, index: 0, ready: true, regen: 0.1, type: 0 },
        { cooldown: 40, index: 1, ready: false, regen: 0.1, type: 3 },
      ],
      skills: [
        {
          id: 186,
          max: 75,
          name: "Mining",
          permBonus: 0,
          profession: true,
          step: 1,
          tempBonus: 0,
          value: 12,
        },
      ],
      totems: [
        undefined,
        {
          durationMs: 120_000,
          guid: 0x1n,
          slot: 1,
          spellId: 8071,
          spellName: "Stoneskin Totem",
          startedAt: 0,
        },
        undefined,
        undefined,
      ],
    }));
    const out = await runTool(tool, { about: "spells" });
    const lines = out.text.split("\n");
    expect(lines.slice(1, 4)).toEqual([
      "Mining: 12/75.",
      "Totem (earth): Stoneskin Totem.",
      "Rune 1: ready.",
    ]);
    expect(out.details.result.after).toMatchObject({
      professions: [{ id: 186, max: 75, name: "Mining", value: 12 }],
      runes: [
        { index: 0, ready: true, type: 0 },
        { index: 1, ready: false, type: 3 },
      ],
      totems: [{ element: "earth", name: "Stoneskin Totem", slot: 1 }],
    });
  });

  test("shows only professions when weapons share the skill list", async () => {
    const { handle, tool } = await world();
    installSpells(handle, { book: [] });
    const base = handle.spells.state();
    const mixed = [
      { id: 43, name: "Swords", profession: false },
      { id: 186, name: "Mining", profession: true },
      { id: 54, name: "Maces", profession: false },
      { id: 356, name: "Fishing", profession: true },
      { id: 101, name: "Dwarven Racial", profession: false },
      { id: 171, name: "Alchemy", profession: true },
      { id: 762, name: "Riding", profession: false },
      { id: 197, name: "Tailoring", profession: true },
      { id: 393, name: "Skinning", profession: true },
      { id: 333, name: "Enchanting", profession: true },
    ].map(({ id, name, profession }) => ({
      id,
      max: 75,
      name,
      permBonus: 0,
      profession,
      step: 1,
      tempBonus: 0,
      value: 10,
    }));
    jest
      .spyOn(handle.spells, "state")
      .mockImplementation(() => ({ ...base, skills: mixed }));
    const out = await runTool(tool, { about: "spells" });
    const lines = out.text.split("\n");
    expect(lines.slice(1)).toEqual([
      "Mining: 10/75.",
      "Fishing: 10/75.",
      "Alchemy: 10/75.",
      "+3 more professions.",
    ]);
    expect(out.details.result.after).toMatchObject({
      professions: [
        { id: 186, name: "Mining" },
        { id: 356, name: "Fishing" },
        { id: 171, name: "Alchemy" },
        { id: 197, name: "Tailoring" },
        { id: 393, name: "Skinning" },
        { id: 333, name: "Enchanting" },
      ],
    });
  });

  test("omits the rune block for a non-death-knight", async () => {
    const { handle, tool } = await world();
    installSpells(handle, { book: [FROST_ARMOR_SPELL] });
    const out = await runTool(tool, { about: "spells" });
    expect(out.text).not.toContain("Rune");
    expect(out.details.result.after).toMatchObject({
      professions: [],
      runes: undefined,
      totems: [],
    });
  });
});
