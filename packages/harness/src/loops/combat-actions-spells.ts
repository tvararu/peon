import type {
  CombatState,
  EntityLookup,
  SpellDefinition,
  SpellEffect,
} from "@peon/core";
import { facing, separation } from "#harness/loops/combat-actions-observation";
import {
  isAutoShot,
  isRangedShot,
  meleeRange,
  RANGED_RANGE_FLAG,
  rangedAura,
} from "#harness/loops/combat-actions-ranged";

const MOVEMENT_INTERRUPT_FLAG = 0x1;
const AUTO_REPEAT_ATTRIBUTE_EX2 = 0x20;
const AURAS = new Set([3, 8, 13, 22, 26, 29, 33, 69, 85, 118]);
const CASTER_SOURCE = 22;
const AREA_ENEMIES = 15;
const WEAPON_DAMAGE = 58;

export function requiresStanding(spell: SpellDefinition): boolean {
  if (spell.attributes.ex2 & AUTO_REPEAT_ATTRIBUTE_EX2) return true;
  const castTimeMs = spell.castTime?.castTimeMs;
  return (
    castTimeMs !== undefined &&
    castTimeMs > 0 &&
    (spell.interruptFlags & MOVEMENT_INTERRUPT_FLAG) !== 0
  );
}

export function unsupportedSpell(
  spell: SpellDefinition,
  form: number | undefined,
): string | undefined {
  const ability = isAutoShot(spell) ? 0 : 0x10;
  if (spell.attributes.raw & (0x40 | ability | 0x2_00))
    return "unsupported_spell_attribute";
  if (spell.attributes.ex & (0x2 | 0x4 | 0x40))
    return "unsupported_channel_or_power";
  if (
    (spell.equippedItem.itemClass !== -1 && !isRangedShot(spell)) ||
    spell.reagents.length > 0
  )
    return "unsupported_item_requirement";
  if (form === undefined) return "unobserved_shapeshift_form";
  if (form !== 0) return "unsupported_shapeshift_form";
  if (spell.targets.stances && !(spell.attributes.ex2 & 0x8_00_00))
    return "required_shapeshift_form";
  if (
    spell.targets.creatureType ||
    spell.targets.requiresSpellFocus ||
    spell.targets.targets & ~2
  )
    return "unsupported_target_requirement";
  if (!spell.castTime) return "unknown_cast_time";
  return unsupportedMechanics(spell);
}

function unsupportedMechanics(spell: SpellDefinition): string | undefined {
  if (
    spell.power.type !== 0 ||
    spell.power.costPerSecond ||
    spell.power.costPerSecondPerLevel ||
    spell.power.costPerLevel
  )
    return "unsupported_power_mechanics";
  const req = spell.auraRequirements;
  if (
    req.casterAuraState ||
    req.targetAuraState ||
    req.casterAuraStateNot ||
    req.targetAuraStateNot
  )
    return "unsupported_aura_state";
  const effects = spell.effects.filter((effect) => effect.effect !== 0);
  if (effects.length === 0) return "unsupported_empty_effects";
  for (const effect of effects) {
    const reason = unsupportedEffect(effect, spell);
    if (reason) return reason;
  }
  return undefined;
}

function unsupportedEffect(
  effect: SpellEffect,
  spell: SpellDefinition,
): string | undefined {
  const weaponShot = effect.effect === WEAPON_DAMAGE && isAutoShot(spell);
  if (!([2, 6, 10].includes(effect.effect) || weaponShot))
    return `unsupported_effect:${effect.effect}`;
  if (
    effect.effect === 6 &&
    !AURAS.has(effect.applyAura) &&
    !rangedAura(spell, effect.applyAura)
  )
    return `unsupported_aura:${effect.applyAura}`;
  if (isCasterArea(spell)) return undefined;
  if (effect.implicitTargetA === 0 && effect.implicitTargetB === 0)
    return "unspecified_effect_target";
  if (
    !(
      [0, 1, 6, 21].includes(effect.implicitTargetA) &&
      [0, 1, 6, 21].includes(effect.implicitTargetB)
    )
  )
    return "unsupported_implicit_target";
  if (effect.radius && effect.radius.max > 0) return "unsupported_area_effect";
  return undefined;
}

export function isCasterArea(spell: SpellDefinition): boolean {
  const effects = spell.effects.filter((effect) => effect.effect !== 0);
  return (
    effects.length > 0 &&
    effects.every(
      (effect) =>
        effect.implicitTargetA === CASTER_SOURCE &&
        effect.implicitTargetB === AREA_ENEMIES &&
        (effect.radius?.max ?? 0) > 0,
    )
  );
}

export function areaReason(
  spell: SpellDefinition,
  state: CombatState,
): string | undefined {
  const distance = separation(state);
  if (distance === undefined) return "unobserved_range";
  const radius = Math.min(
    ...spell.effects.flatMap((effect) =>
      effect.radius ? [effect.radius.max] : [],
    ),
  );
  return distance > radius ? "target_outside_radius" : undefined;
}

function effectKind(effect: number): string {
  if (effect === 2) return "damage";
  if (effect === 10) return "healing";
  return "aura";
}

export function manaReason(
  spell: SpellDefinition,
  state: CombatState,
): string | undefined {
  if (state.self.powerType !== 0 || state.self.power === undefined)
    return "unobserved_mana";
  const percentage = spell.power.costPercentageOfBaseMana;
  if (percentage && state.self.baseMana === undefined)
    return "unobserved_base_mana";
  const cost =
    spell.power.costRaw +
    Math.floor(((state.self.baseMana ?? 0) * percentage) / 100);
  if (state.self.power < cost) return "insufficient_mana";
  return undefined;
}

export function auraReason(
  spell: SpellDefinition,
  state: CombatState,
  hostile: boolean,
): string | undefined {
  const auras = hostile ? state.targetAuras : state.auras;
  const req = spell.auraRequirements;
  if (
    req.casterAuraSpell &&
    !state.auras.some((aura) => aura.spellId === req.casterAuraSpell)
  )
    return "caster_aura_required";
  if (
    req.targetAuraSpell &&
    !auras.some((aura) => aura.spellId === req.targetAuraSpell)
  )
    return "target_aura_required";
  if (
    req.excludeCasterAuraSpell &&
    state.auras.some((aura) => aura.spellId === req.excludeCasterAuraSpell)
  )
    return "caster_aura_excluded";
  if (
    req.excludeTargetAuraSpell &&
    auras.some((aura) => aura.spellId === req.excludeTargetAuraSpell)
  )
    return "target_aura_excluded";
  if (
    spell.effects.some((effect) => effect.effect === 6) &&
    auras.some((aura) => aura.spellId === spell.id)
  )
    return "aura_already_present";
  return undefined;
}

type ChannelClock = {
  spellId: number;
  remainingMs: number | undefined;
  endsAt: number | undefined;
};

export function channelRemainingMs(
  channel: ChannelClock,
  now: number,
): number | undefined {
  if (channel.endsAt !== undefined) return Math.max(0, channel.endsAt - now);
  return channel.remainingMs === undefined
    ? undefined
    : Math.max(0, channel.remainingMs);
}

export function channelText(
  channel: ChannelClock,
  name: string | undefined,
  now: number,
): string {
  const label = name ?? `spell ${channel.spellId}`;
  const remainingMs = channelRemainingMs(channel, now);
  if (remainingMs === undefined) return `channelling ${label}`;
  return `channelling ${label}, ${(remainingMs / 1000).toFixed(1)} s left`;
}

export function describeSpell(spell: SpellDefinition, self: boolean): string {
  if (isAutoShot(spell))
    return `Start ${spell.name} on selected creature: repeating ranged weapon shots that use ammo, until stopped or the creature dies; needs line of sight, facing, and ${spell.range?.maxHostile ?? "unknown"} yd or less but outside melee range; no mana`;
  const castMs = spell.castTime && Math.max(0, spell.castTime.castTimeMs);
  const effects = spell.effects
    .filter((effect) => effect.effect !== 0)
    .map((effect) => ({
      kind: effectKind(effect.effect),
      effect: effect.effect,
      aura: effect.applyAura,
      base: effect.basePoints + 1,
      perLevel: effect.realPointsPerLevel,
      intervalMs: effect.amplitude,
    }));
  const on = isCasterArea(spell)
    ? `enemies within ${spell.effects.find((effect) => effect.radius)?.radius?.max ?? "unknown"} yd of you`
    : self
      ? "self"
      : "selected creature";
  const control = spell.effects.flatMap((effect) =>
    effect.effect !== 6
      ? []
      : effect.applyAura === 26
        ? ["roots them in place"]
        : effect.applyAura === 33
          ? ["slows their movement"]
          : [],
  );
  const controlText = control.length > 0 ? `; ${control.join(", ")}` : "";
  return `Request ${spell.name} ${spell.rank} on ${on}${controlText}; mana ${spell.power.costRaw} + ${spell.power.costPercentageOfBaseMana}% base mana; cast ${castMs}ms; duration ${spell.duration?.durationMs ?? "unknown"}ms; DBC base effects (server applies scaling/modifiers) ${JSON.stringify(effects)}`;
}

export function rangeSupport(
  spell: SpellDefinition,
  hostile: boolean,
): string | undefined {
  const flags = spell.range?.flags;
  if (!hostile || flags === 0) return undefined;
  if (flags === RANGED_RANGE_FLAG && isRangedShot(spell)) return undefined;
  return "unsupported_range";
}

export function hostileReason(
  spell: SpellDefinition,
  state: CombatState,
  entity: EntityLookup,
): string | undefined {
  const distance = separation(state);
  if (distance === undefined) return "unobserved_range";
  const range = spell.range;
  if (range === undefined)
    throw new Error("hostile spell is missing range metadata");
  if (distance < range.minHostile || distance > range.maxHostile)
    return "out_of_range";
  if (isRangedShot(spell) && distance <= meleeRange(entity, state))
    return "too_close";
  if (!facing(state)) return "not_facing";
  return undefined;
}
