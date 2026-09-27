import { jest } from "bun:test";
import { context, setup, spell } from "#test-support/combat-actions-fixtures";
import type { RangedGear } from "#wow/combat-ranged-gear";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";
import type { SpellDefinition, SpellEffect } from "#wow/spell-catalog";

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

export function bowAndArrows(count = 1000): RangedGear {
  return {
    ammo: { count, entry: 2515, itemClass: 6, subclass: 2 },
    weapon: { entry: 2504, itemClass: 2, subclass: 2 },
  };
}

export function hunter(
  targetX: number,
  gear: () => RangedGear = () => bowAndArrows(),
) {
  let now = 1000;
  const fixture = setup(() => now, { gear });
  const defs = hunterSpells();
  jest
    .spyOn(fixture.combatStore, "definition")
    .mockImplementation((id) => defs[id]);
  fixture.combatStore.applyInitialSpells({
    cooldowns: [],
    spells: HUNTER_SPELLS.map((spellId) => ({ spellId })),
  });
  fixture.fields.set(UNIT_FIELDS.POWER1.offset, 300);
  fixture.store.update(1n, { combatReach: 1.5 });
  fixture.store.update(2n, { combatReach: 1.5 });
  fixture.motion.observe(2n, {
    mapId: 530,
    orientation: 0,
    x: targetX,
    y: 0,
    z: 0,
  });
  const advance = (ms: number) => {
    now += ms;
  };
  const ids = () =>
    fixture.actions
      .observe(context)
      .candidates.map((candidate) => candidate.id);
  const unavailable = () =>
    fixture.actions.observe(context).observation["unavailable"];
  return { ...fixture, advance, ids, unavailable };
}
