import type {
  AreaState,
  CombatState,
  EntityLookup,
  FactionRelation,
  GroundOracle,
  NearbyRow,
} from "@peon/core";
import {
  auraObservation,
  combatLogObservation,
  facing,
  hex,
  navigationObservation,
  outcomeObservation,
  separation,
  targetCastObservation,
  unitObservation,
} from "#harness/loops/combat-actions-observation";
import { hunterObservation } from "#harness/loops/combat-actions-pet";
import type { RangedGear } from "#harness/loops/combat-ranged-gear";
import type { RejectionTracker } from "#harness/loops/combat-rejections";
import type { CombatPort, ControlPort } from "#harness/loops/ports";
import type { TacticsContext } from "#harness/loops/tactics";

export type ActionDeps = {
  combat: CombatPort;
  control: ControlPort;
  entity: EntityLookup;
  relation: (guid: bigint) => FactionRelation;
  now: () => number;
  gear?: () => RangedGear;
  combatLog?: () => AreaState<"combatlog"> | undefined;
  spells?: () => AreaState<"spells"> | undefined;
  ground?: GroundOracle | undefined;
  nearby?: () => readonly NearbyRow[];
  aggro?: (guid: bigint) => boolean;
};

export type BaseObservationInput = {
  deps: ActionDeps;
  rejections: RejectionTracker;
  context: TacticsContext;
  state: CombatState;
  spells: { id: string; reason?: string }[];
};

export function baseObservation({
  deps,
  rejections,
  context,
  state,
  spells,
}: BaseObservationInput): Record<string, unknown> {
  return {
    self: unitObservation(state.self),
    target: state.target ? unitObservation(state.target) : null,
    targetRelation: deps.relation(context.targetGuid),
    separation: separation(state) ?? null,
    facingTarget: facing(state),
    casting: state.casting
      ? { ...state.casting, target: hex(state.casting.target) }
      : null,
    pendingCast: state.pendingCast
      ? { ...state.pendingCast, target: hex(state.pendingCast.target) }
      : null,
    attacking: state.attacking,
    attackTarget: hex(state.attackTarget),
    pendingAttack: hex(state.pendingAttack),
    ...hunterObservation(state, deps.entity, context.targetGuid),
    combatLog: combatLogObservation(deps.combatLog?.(), {
      now: deps.now(),
      self: state.self.guid,
      target: context.targetGuid,
    }),
    targetCast: targetCastObservation(deps.spells?.(), {
      name: (id) => deps.combat.definition(id)?.name,
      now: deps.now(),
      target: context.targetGuid,
    }),
    auras: state.auras.map(auraObservation),
    targetAuras: state.targetAuras.map(auraObservation),
    cooldowns: state.cooldowns,
    unknownLearned: state.unknownLearned,
    unavailable: spells
      .filter((action) => action.reason)
      .map((action) => ({ id: action.id, reason: action.reason })),
    lastOutcome: state.lastOutcome
      ? outcomeObservation(state.lastOutcome)
      : null,
    lastXp: state.lastXp
      ? { ...state.lastXp, victim: hex(state.lastXp.victim) }
      : null,
    navigation: navigationObservation(deps.control.navigationState()),
    rejections: rejections.observation(),
  };
}
