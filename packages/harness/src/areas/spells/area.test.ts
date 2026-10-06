import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

const ME = 0x2an;
const TRAINER = 0xf1_30_00_3e_d7_00_1a_2bn;
const MOB = 0xf1_30_00_3e_ea_00_0a_bcn;

describe("spells harness rules", () => {
  test("a mirror image writes no row and no fallback", () => {
    const event: AreaEvent = {
      area: "spells",
      event: {
        classId: 8,
        displayId: 15_476,
        gender: 1,
        guid: ME,
        race: 10,
        type: "mirror_image",
      },
    };
    expect(areaDrafts(areaRuleSet(), event, testRuleInput())).toEqual([]);
  });

  test("a projectile position writes no row and no fallback", () => {
    const event: AreaEvent = {
      area: "spells",
      event: {
        castCount: 2,
        caster: ME,
        type: "projectile_moved",
        x: 1,
        y: 2,
        z: 3,
      },
    };
    expect(areaDrafts(areaRuleSet(), event, testRuleInput())).toEqual([]);
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
      {
        event: "spells/channel_start",
        text: expect.stringMatching(/Channelling.*5143/),
      },
      {
        event: "spells/channel_start",
        text: expect.stringMatching(/Channelling.*5143/),
      },
      {
        event: "spells/channel_end",
        text: expect.stringMatching(/5143.*cancelled/),
      },
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
        data: {
          durationMs: 2500,
          guid: MOB.toString(10),
          kind: "cast",
          spellId: 9613,
          spellName: "Shadow Bolt",
        },
        event: "spells/target_start",
        text: expect.stringMatching(
          /Scourge Invader starts casting Shadow Bolt/,
        ),
      },
    ]);
    expect(areaDrafts(rules, end, rc)).toMatchObject([
      {
        data: {
          guid: MOB.toString(10),
          spellId: 9613,
          spellName: "Shadow Bolt",
        },
        event: "spells/target_interrupted",
        text: expect.stringMatching(
          /Scourge Invader.*Shadow Bolt.*interrupted/,
        ),
      },
    ]);
  });

  test("a relevant channel start says channelling", () => {
    const rc = testRuleInput({
      lookup: testLookup({ unitName: () => "Scourge Invader" }),
    });
    const start: AreaEvent = {
      area: "spells",
      event: {
        durationMs: 3000,
        guid: MOB,
        kind: "channel",
        relevant: 1,
        spellId: 689,
        spellName: "Drain Life",
        type: "unit_cast_start",
      },
    };
    expect(areaDrafts(areaRuleSet(), start, rc)).toMatchObject([
      {
        data: {
          durationMs: 3000,
          guid: MOB.toString(10),
          kind: "channel",
          spellId: 689,
          spellName: "Drain Life",
        },
        event: "spells/target_start",
        text: expect.stringMatching(/Scourge Invader.*channelling.*Drain Life/),
      },
    ]);
  });
  test("an unnamed caster and spell fall back to 'A unit' and the spell id", () => {
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
    const text = areaDrafts(areaRuleSet(), start, testRuleInput())[0]?.text;
    expect(text).toContain("spell 5143");
    expect(text).toContain("A unit");
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
        text: expect.stringMatching(/Stoneskin Totem.*earth/),
      },
      {
        event: "spells/totem_gone",
        text: expect.stringMatching(/Stoneskin Totem.*earth.*gone/),
      },
    ]);
  });
});

describe("spells skill rows", () => {
  const changed = (from: number | undefined, to: number): AreaEvent => ({
    area: "spells",
    event: {
      from,
      id: 186,
      max: 75,
      name: "Mining",
      to,
      type: "skill_changed",
    },
  });

  test("a new skill learns, a raise reads is now, and a removal reads dropped", () => {
    const removed: AreaEvent = {
      area: "spells",
      event: { id: 186, name: "Mining", type: "skill_removed" },
    };
    expect(
      areaDrafts(areaRuleSet(), changed(undefined, 1), testRuleInput()),
    ).toMatchObject([
      {
        event: "spells/skill_changed",
        text: expect.stringMatching(/Mining.*learned.*1\/75/),
      },
    ]);
    expect(
      areaDrafts(areaRuleSet(), changed(1, 12), testRuleInput()),
    ).toMatchObject([
      {
        event: "spells/skill_changed",
        text: expect.stringMatching(/Mining.*is now.*12\/75/),
      },
    ]);
    expect(areaDrafts(areaRuleSet(), removed, testRuleInput())).toMatchObject([
      {
        event: "spells/skill_removed",
        text: expect.stringMatching(/Mining.*dropped/),
      },
    ]);
  });

  test("the second row for one skill within a minute stays quiet; another skill writes", () => {
    const rules = areaRuleSet();
    const rc = testRuleInput({ now: 1_000_000 });
    expect(areaDrafts(rules, changed(1, 12), rc)).toHaveLength(1);
    expect(
      areaDrafts(rules, changed(12, 13), testRuleInput({ now: 1_000_030 })),
    ).toEqual([]);
    expect(
      areaDrafts(rules, changed(12, 13), testRuleInput({ now: 1_060_001 })),
    ).toHaveLength(1);
    const other: AreaEvent = {
      area: "spells",
      event: {
        from: 1,
        id: 182,
        max: 75,
        name: "Herbalism",
        to: 2,
        type: "skill_changed",
      },
    };
    expect(
      areaDrafts(rules, other, testRuleInput({ now: 1_000_030 })),
    ).toHaveLength(1);
    const removed: AreaEvent = {
      area: "spells",
      event: { id: 186, name: "Mining", type: "skill_removed" },
    };
    expect(
      areaDrafts(rules, removed, testRuleInput({ now: 1_000_030 })),
    ).toHaveLength(1);
  });
});
