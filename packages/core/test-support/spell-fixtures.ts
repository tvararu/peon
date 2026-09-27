import type { SpellDefinition, SpellEffect } from "#wow/spell-catalog";

export function spell(): SpellDefinition {
  return {
    attributes: {
      ex: 0,
      ex2: 0,
      raw: 0,
    },
    auraRequirements: {
      casterAuraSpell: 0,
      casterAuraState: 0,
      casterAuraStateNot: 0,
      excludeCasterAuraSpell: 0,
      excludeTargetAuraSpell: 0,
      targetAuraSpell: 0,
      targetAuraState: 0,
      targetAuraStateNot: 0,
    },
    castTime: {
      castTimeMs: 1000,
      id: 1,
    },
    cooldown: {
      category: 0,
      categoryRecoveryTimeMs: 0,
      recoveryTimeMs: 0,
      startRecoveryTimeMs: 1500,
    },
    duration: undefined,
    effects: [
      {
        amplitude: 0,
        applyAura: 0,
        basePoints: 10,
        effect: 2,
        implicitTargetA: 6,
        implicitTargetB: 0,
        radius: undefined,
        realPointsPerLevel: 1,
      },
    ],
    equippedItem: { itemClass: -1, subclassMask: 0 },
    id: 17,
    interruptFlags: 0,
    maxLevel: 0,
    name: "Fixture spell",
    power: {
      costPercentageOfBaseMana: 10,
      costPerLevel: 0,
      costPerSecond: 0,
      costPerSecondPerLevel: 0,
      costRaw: 0,
      type: 0,
    },
    range: {
      flags: 0,
      id: 2,
      maxHostile: 30,
      minHostile: 0,
    },
    rank: "Rank 1",
    reagents: [],
    targets: {
      creatureType: 0,
      requiresSpellFocus: 0,
      stances: 0,
      targets: 2,
    },
  };
}

export function standingRequiredSpell(): SpellDefinition {
  return {
    ...spell(),
    castTime: {
      castTimeMs: 1500,
      id: 3,
    },
    interruptFlags: 15,
  };
}

export function movementCompatibleSpell(): SpellDefinition {
  return {
    ...spell(),
    castTime: { castTimeMs: 0, id: 4 },
    interruptFlags: 8,
  };
}

export const AUTO_SHOT = 75;
export const ARCANE_SHOT = 3044;
export const CONCUSSIVE_SHOT = 5116;
export const SERPENT_STING = 13_549;
export const RAPTOR_STRIKE = 14_260;
export const HUNTER_SPELLS = [
  AUTO_SHOT,
  ARCANE_SHOT,
  CONCUSSIVE_SHOT,
  SERPENT_STING,
  RAPTOR_STRIKE,
];

const HUNTER_RANGE = { flags: 2, id: 114, maxHostile: 35, minHostile: 0 };
const RANGED_CAST = { castTimeMs: -1_000_000, id: 18 };
const BOW_GUN_CROSSBOW = 0x4_00_0c;
const MELEE_WEAPONS = 0x2_a5_f3;

function effect(over: Partial<SpellEffect>): SpellEffect {
  return {
    amplitude: 0,
    applyAura: 0,
    basePoints: 0,
    effect: 2,
    implicitTargetA: 6,
    implicitTargetB: 0,
    radius: undefined,
    realPointsPerLevel: 0,
    ...over,
  };
}

function shot(
  id: number,
  name: string,
  over: Partial<SpellDefinition>,
): SpellDefinition {
  const base = spell();
  return {
    ...base,
    attributes: { ex: 0, ex2: 0x2_00_00, raw: 0x1_00_02 },
    castTime: RANGED_CAST,
    equippedItem: { itemClass: 2, subclassMask: BOW_GUN_CROSSBOW },
    id,
    name,
    range: HUNTER_RANGE,
    targets: { ...base.targets, targets: 0 },
    ...over,
  };
}

export function hunterSpells(): Record<number, SpellDefinition> {
  const base = spell();
  return {
    [ARCANE_SHOT]: shot(ARCANE_SHOT, "Arcane Shot", {
      effects: [effect({ basePoints: 14 })],
      power: { ...base.power, costPercentageOfBaseMana: 5 },
    }),
    [AUTO_SHOT]: shot(AUTO_SHOT, "Auto Shot", {
      attributes: { ex: 0, ex2: 0x20, raw: 0x5_00_12 },
      effects: [effect({ basePoints: -1, effect: 58 })],
      interruptFlags: 33,
      power: { ...base.power, costPercentageOfBaseMana: 0 },
      rank: "",
    }),
    [CONCUSSIVE_SHOT]: shot(CONCUSSIVE_SHOT, "Concussive Shot", {
      duration: { durationMs: 4000, id: 35 },
      effects: [effect({ applyAura: 33, basePoints: -51, effect: 6 })],
      power: { ...base.power, costPercentageOfBaseMana: 6 },
      rank: "",
    }),
    [RAPTOR_STRIKE]: {
      ...base,
      attributes: { ex: 0, ex2: 0, raw: 0x5_04_04 },
      castTime: { castTimeMs: 0, id: 1 },
      effects: [effect({ basePoints: 10, effect: 58 })],
      equippedItem: { itemClass: 2, subclassMask: MELEE_WEAPONS },
      id: RAPTOR_STRIKE,
      name: "Raptor Strike",
      range: { flags: 1, id: 2, maxHostile: 5, minHostile: 0 },
    },
    [SERPENT_STING]: shot(SERPENT_STING, "Serpent Sting", {
      duration: { durationMs: 15_000, id: 8 },
      effects: [
        effect({ amplitude: 3000, applyAura: 3, basePoints: 7, effect: 6 }),
        effect({ applyAura: 271, basePoints: -1, effect: 6 }),
      ],
      power: { ...base.power, costPercentageOfBaseMana: 9 },
      rank: "Rank 2",
    }),
  };
}
