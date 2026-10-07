import type { CombatState, SpellDefinition } from "@peon/core";
import type { ActionDeps } from "#harness/loops/combat-actions-frame";
import { immuneTo } from "#harness/loops/combat-actions-observation";
import {
  gearReason,
  isAutoShot,
  isRangedShot,
  NO_RANGED_GEAR,
} from "#harness/loops/combat-actions-ranged";
import {
  auraReason,
  hostileReason,
  manaReason,
  rangeSupport,
  unsupportedSpell,
} from "#harness/loops/combat-actions-spells";
import type { TacticsContext } from "#harness/loops/tactics";

export type SpellAction = {
  spell?: SpellDefinition;
  target: bigint;
  id: string;
  reason?: string;
  supported: boolean;
};

export type SpellDeps = Pick<
  ActionDeps,
  "combat" | "combatLog" | "entity" | "gear" | "now"
>;

export function spellAction(
  deps: SpellDeps,
  id: number,
  context: TacticsContext,
  state: CombatState,
): SpellAction {
  const spell = deps.combat.definition(id);
  const hostile =
    spell?.effects.some(
      (effect) => effect.implicitTargetA === 6 || effect.implicitTargetB === 6,
    ) ?? false;
  const target = hostile ? context.targetGuid : state.self.guid;
  const actionId = `spell:${id}:${hostile ? "target" : "self"}`;
  if (!spell)
    return {
      id: actionId,
      target,
      reason: "unknown_metadata",
      supported: false,
    };
  const unsupported =
    unsupportedSpell(spell, state.self.shapeshiftForm) ??
    rangeSupport(spell, hostile) ??
    (isRangedShot(spell)
      ? gearReason(spell, deps.gear?.() ?? NO_RANGED_GEAR)
      : undefined);
  const immune =
    hostile && immuneTo(deps.combatLog?.(), context.targetGuid, id);
  const reason =
    unsupported ??
    (immune ? "immune" : spellReason(deps, spell, state, hostile));
  return { id: actionId, spell, target, reason, supported: !unsupported };
}

function spellReason(
  deps: SpellDeps,
  spell: SpellDefinition,
  state: CombatState,
  hostile: boolean,
): string | undefined {
  if (isAutoShot(spell) && state.autoRepeat?.target === state.target?.guid)
    return "auto_shot_active";
  if (deps.combat.readyAt(spell.id) > deps.now()) return "cooldown";
  const reason = manaReason(spell, state) ?? auraReason(spell, state, hostile);
  if (reason) return reason;
  const target = hostile ? state.target : state.self;
  if (
    !hostile &&
    spell.effects.some(
      (effect) => effect.effect === 10 || effect.applyAura === 8,
    ) &&
    (target?.health === undefined ||
      target.maxHealth === undefined ||
      target.health >= target.maxHealth)
  )
    return "no_observed_healing_needed";
  return hostile ? hostileReason(spell, state, deps.entity) : undefined;
}
