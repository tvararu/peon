import { describe, expect, test } from "bun:test";
import { LockKeyType, type LockEntry } from "#wow/areas/objects/lock-catalog";
import { type OpenLockNeed, pickOpenLock } from "#wow/areas/objects/open-lock";
import type { SpellDefinition } from "#wow/spell-catalog";

const OPEN_LOCK_EFFECT = 33;

function spell(
  id: number,
  miscValue: number,
  basePoints = 99,
): SpellDefinition {
  return {
    id,
    name: `spell ${id}`,
    rank: "",
    maxLevel: 0,
    power: {
      type: 0,
      costRaw: 0,
      costPerLevel: 0,
      costPerSecond: 0,
      costPerSecondPerLevel: 0,
      costPercentageOfBaseMana: 0,
    },
    castTime: undefined,
    range: undefined,
    duration: undefined,
    cooldown: {
      recoveryTimeMs: 0,
      category: 0,
      categoryRecoveryTimeMs: 0,
      startRecoveryTimeMs: 0,
    },
    attributes: { raw: 0, ex: 0, ex2: 0 },
    targets: { targets: 0, creatureType: 0, stances: 0, requiresSpellFocus: 0 },
    interruptFlags: 0,
    equippedItem: { itemClass: 0, subclassMask: 0 },
    reagents: [],
    effects: [
      {
        effect: OPEN_LOCK_EFFECT,
        realPointsPerLevel: 0,
        basePoints,
        implicitTargetA: 0,
        implicitTargetB: 0,
        applyAura: 0,
        amplitude: 0,
        miscValue,
        radius: undefined,
      },
    ],
    auraRequirements: {
      casterAuraState: 0,
      targetAuraState: 0,
      casterAuraStateNot: 0,
      targetAuraStateNot: 0,
      casterAuraSpell: 0,
      targetAuraSpell: 0,
      excludeCasterAuraSpell: 0,
      excludeTargetAuraSpell: 0,
    },
  };
}

function lock43(): LockEntry {
  return {
    id: 43,
    cases: Array.from({ length: 8 }, (_, i) =>
      i === 1
        ? { type: LockKeyType.SKILL, index: 13, skill: 0 }
        : { type: 0, index: 0, skill: 0 },
    ),
  };
}

describe("pickOpenLock (Entities/GameObject/GameObject.cpp:3035-3092, Spells/Spell.cpp:8707-8760)", () => {
  test("lock id 0 opens with any open-lock spell", () => {
    expect(
      pickOpenLock({
        lock: undefined,
        hasItem: () => false,
        skillOf: () => 0,
        spellbook: [spell(6477, 1)],
      }),
    ).toEqual({ by: "spell", spellId: 6477 });
  });

  test("a skill lock picks the spell whose open-lock effect matches the index", () => {
    expect(
      pickOpenLock({
        lock: lock43(),
        hasItem: () => false,
        skillOf: () => 50,
        spellbook: [spell(6477, 0), spell(6478, 13)],
      }),
    ).toEqual({ by: "spell", spellId: 6478 });
  });

  test("a skill below the lock need refuses with the lock skill", () => {
    const need: OpenLockNeed = { skill: 5, need: 200 };
    expect(
      pickOpenLock({
        lock: {
          id: 57,
          cases: Array.from({ length: 8 }, (_, i) =>
            i === 1
              ? { type: LockKeyType.SKILL, index: 5, skill: 200 }
              : { type: 0, index: 0, skill: 0 },
          ),
        },
        hasItem: () => false,
        skillOf: () => 50,
        spellbook: [spell(6477, 5)],
      }),
    ).toEqual({ ok: false, reason: "locked", ...need });
  });

  test("a spell lock returns the lock spell even when unknown", () => {
    expect(
      pickOpenLock({
        lock: {
          id: 9,
          cases: Array.from({ length: 8 }, (_, i) =>
            i === 0
              ? { type: LockKeyType.SPELL, index: 17_667, skill: 0 }
              : { type: 0, index: 0, skill: 0 },
          ),
        },
        hasItem: () => false,
        skillOf: () => 0,
        spellbook: [],
      }),
    ).toEqual({ by: "spell", spellId: 17_667 });
  });

  test("a key item the character carries returns the key", () => {
    expect(
      pickOpenLock({
        lock: {
          id: 11,
          cases: Array.from({ length: 8 }, (_, i) =>
            i === 0
              ? { type: LockKeyType.ITEM, index: 9240, skill: 0 }
              : { type: 0, index: 0, skill: 0 },
          ),
        },
        hasItem: (entry) => entry === 9240,
        skillOf: () => 0,
        spellbook: [spell(6477, 1)],
      }),
    ).toEqual({ by: "item", entry: 9240 });
  });

  test("a missing key refuses locked with no skill", () => {
    expect(
      pickOpenLock({
        lock: {
          id: 11,
          cases: Array.from({ length: 8 }, (_, i) =>
            i === 0
              ? { type: LockKeyType.ITEM, index: 9240, skill: 0 }
              : { type: 0, index: 0, skill: 0 },
          ),
        },
        hasItem: () => false,
        skillOf: () => 0,
        spellbook: [spell(6477, 1)],
      }),
    ).toEqual({ ok: false, reason: "locked", skill: 0, need: 0 });
  });
});
