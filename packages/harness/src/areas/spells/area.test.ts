import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { spellsHarness } from "#harness/areas/spells/area";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

const ME = 0x2an;
const TRAINER = 0xf1_30_00_3e_d7_00_1a_2bn;
const MOB = 0xf1_30_00_3e_ea_00_0a_bcn;

describe("spells harness rules", () => {
  test("the area claims the cancelAura and setActionButton acts", () => {
    expect(spellsHarness.worldActs).toEqual([
      "cancelAura",
      "destroyTotem",
      "setActionButton",
    ]);
  });

  test("a spell visual or impact writes no row", () => {
    const events: AreaEvent[] = [
      {
        area: "spells",
        event: { guid: TRAINER, impact: false, kit: 179, type: "spell_visual" },
      },
      {
        area: "spells",
        event: { guid: ME, impact: true, kit: 362, type: "spell_visual" },
      },
    ];
    const rules = areaRuleSet();
    for (const event of events)
      expect(areaDrafts(rules, event, testRuleInput())).toEqual([]);
  });

  test("a channel start or end writes its ruled row", () => {
    const events: AreaEvent[] = [
      {
        area: "spells",
        event: {
          durationMs: 3000,
          spellId: 5143,
          target: MOB,
          type: "channel_start",
        },
      },
      {
        area: "spells",
        event: {
          durationMs: undefined,
          spellId: 5143,
          target: undefined,
          type: "channel_start",
        },
      },
      {
        area: "spells",
        event: { reason: "cancelled", spellId: 5143, type: "channel_end" },
      },
    ];
    const rules = areaRuleSet();
    const rows = events.map(
      (event) => areaDrafts(rules, event, testRuleInput())[0],
    );
    expect(rows).toMatchObject([
      { event: "spells/channel_start", text: "Channelling spell 5143." },
      { event: "spells/channel_start", text: "Channelling spell 5143." },
      { event: "spells/channel_end", text: "spell 5143 ended (cancelled)." },
    ]);
  });

  test("a relevant caster's start and interruption write their rows", () => {
    const rc = testRuleInput({
      lookup: testLookup({ unitName: () => "Scourge Invader" }),
    });
    const start: AreaEvent = {
      area: "spells",
      event: {
        durationMs: 2500,
        guid: MOB,
        kind: "cast",
        relevant: 1,
        spellId: 9613,
        spellName: "Shadow Bolt",
        type: "unit_cast_start",
      },
    };
    const end: AreaEvent = {
      area: "spells",
      event: {
        guid: MOB,
        outcome: "interrupted",
        relevant: 1,
        spellId: 9613,
        spellName: "Shadow Bolt",
        type: "unit_cast_end",
      },
    };
    const rules = areaRuleSet();
    expect(areaDrafts(rules, start, rc)).toMatchObject([
      {
        data: { durationMs: 2500, spellId: 9613 },
        event: "spells/target_start",
        text: "Scourge Invader starts casting Shadow Bolt.",
      },
    ]);
    expect(areaDrafts(rules, end, rc)).toMatchObject([
      {
        event: "spells/target_interrupted",
        text: "Scourge Invader's Shadow Bolt was interrupted.",
      },
    ]);
  });

  test("an unnamed caster or spell falls back to ids", () => {
    const start: AreaEvent = {
      area: "spells",
      event: {
        durationMs: 1500,
        guid: MOB,
        kind: "channel",
        relevant: 1,
        spellId: 5143,
        spellName: undefined,
        type: "unit_cast_start",
      },
    };
    expect(
      areaDrafts(areaRuleSet(), start, testRuleInput())[0]?.text,
    ).toContain("spell 5143");
  });

  test("other casters and settled casts write no row", () => {
    const events: AreaEvent[] = [
      {
        area: "spells",
        event: {
          durationMs: 2500,
          guid: MOB,
          kind: "cast",
          relevant: 0,
          spellId: 9613,
          spellName: "Shadow Bolt",
          type: "unit_cast_start",
        },
      },
      {
        area: "spells",
        event: {
          guid: MOB,
          outcome: "interrupted",
          relevant: 0,
          spellId: 9613,
          spellName: "Shadow Bolt",
          type: "unit_cast_end",
        },
      },
      ...(["succeeded", "expired", "finished"] as const).map(
        (outcome): AreaEvent => ({
          area: "spells",
          event: {
            guid: MOB,
            outcome,
            relevant: 1,
            spellId: 9613,
            spellName: "Shadow Bolt",
            type: "unit_cast_end",
          },
        }),
      ),
    ];
    const rules = areaRuleSet();
    for (const event of events)
      expect(areaDrafts(rules, event, testRuleInput())).toEqual([]);
  });
});

describe("spells totem rows", () => {
  test("a totem placement and its end write their ruled rows", () => {
    const events: AreaEvent[] = [
      {
        area: "spells",
        event: {
          durationMs: 120_000,
          guid: 0xf1_30_00_09_5b_00_00_01n,
          slot: 1,
          spellId: 8071,
          spellName: "Stoneskin Totem",
          type: "totem_created",
        },
      },
      {
        area: "spells",
        event: {
          guid: 0xf1_30_00_09_5b_00_00_01n,
          reason: "gone",
          slot: 1,
          spellId: 8071,
          spellName: "Stoneskin Totem",
          type: "totem_gone",
        },
      },
    ];
    const rules = areaRuleSet();
    const rows = events.map(
      (event) => areaDrafts(rules, event, testRuleInput())[0],
    );
    expect(rows).toMatchObject([
      {
        event: "spells/totem_created",
        text: "Stoneskin Totem placed (earth).",
      },
      {
        event: "spells/totem_gone",
        text: "Stoneskin Totem gone (earth, gone).",
      },
    ]);
  });
});
