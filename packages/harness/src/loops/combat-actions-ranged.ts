import {
  type CombatState,
  type EntityLookup,
  isUnit,
  type SpellDefinition,
} from "@peon/core";
import type { RangedGear } from "#harness/loops/combat-ranged-gear";

const USES_RANGED_SLOT = 0x2;
const AUTO_REPEAT = 0x20;
const WEAPON = 2;
const PROJECTILE = 6;
const BOW = 2;
const GUN = 3;
const CROSSBOW = 18;
const AMMO_WEAPONS = (1 << BOW) | (1 << GUN) | (1 << CROSSBOW);
const ARROW = 2;
const BULLET = 3;
const RANGED_AURAS = new Set([33, 271]);
const MIN_MELEE_REACH = 1.5;
export const RANGED_RANGE_FLAG = 2;
export const NO_RANGED_GEAR: RangedGear = {
  ammo: undefined,
  weapon: undefined,
};

export function isRangedShot(spell: SpellDefinition): boolean {
  const { itemClass, subclassMask } = spell.equippedItem;
  return (
    (spell.attributes.raw & USES_RANGED_SLOT) !== 0 &&
    itemClass === WEAPON &&
    subclassMask !== 0 &&
    (subclassMask & ~AMMO_WEAPONS) === 0
  );
}

export function isAutoShot(spell: SpellDefinition): boolean {
  return isRangedShot(spell) && (spell.attributes.ex2 & AUTO_REPEAT) !== 0;
}

export function rangedAura(spell: SpellDefinition, aura: number): boolean {
  return isRangedShot(spell) && RANGED_AURAS.has(aura);
}

export function meleeRange(entity: EntityLookup, state: CombatState): number {
  const reach = (guid: bigint | undefined) => {
    const unit = guid === undefined ? undefined : entity(guid);
    const value = isUnit(unit) ? unit.combatReach : undefined;
    return Math.max(value ?? MIN_MELEE_REACH, MIN_MELEE_REACH);
  };
  return Math.max(
    5,
    reach(state.self.guid) + reach(state.target?.guid) + 4 / 3,
  );
}

export function gearReason(
  spell: SpellDefinition,
  gear: RangedGear,
): string | undefined {
  const { weapon, ammo } = gear;
  if (weapon === null) return "no_ranged_weapon";
  if (weapon?.subclass === undefined) return "unobserved_ranged_weapon";
  if (
    weapon.itemClass !== WEAPON ||
    !(spell.equippedItem.subclassMask & (1 << weapon.subclass))
  )
    return "wrong_ranged_weapon";
  if (ammo === null) return "no_ammo";
  if (ammo?.subclass === undefined) return "unobserved_ammo";
  const wanted = weapon.subclass === GUN ? BULLET : ARROW;
  if (ammo.itemClass !== PROJECTILE || ammo.subclass !== wanted)
    return "wrong_ammo";
  if (ammo.count <= 0) return "no_ammo";
  return undefined;
}
