import {
  type CombatState,
  type EntityLookup,
  type FactionRelation,
  isUnit,
  ObjectType,
  UnitFlag,
} from "@peon/core";
import type { CombatPort } from "#harness/loops/ports";

type TargetDeps = {
  combat: Pick<CombatPort, "isAttackingSelf">;
  entity: EntityLookup;
  relation: (guid: bigint) => FactionRelation;
};

const TARGET_BLOCK =
  UnitFlag.NON_ATTACKABLE |
  UnitFlag.PLAYER_CONTROLLED |
  UnitFlag.NOT_ATTACKABLE_1 |
  UnitFlag.IMMUNE_TO_PC |
  UnitFlag.NON_ATTACKABLE_2 |
  UnitFlag.TAXI_FLIGHT |
  UnitFlag.NOT_SELECTABLE;
const SELF_BLOCK =
  UnitFlag.SERVER_CONTROLLED |
  UnitFlag.STUNNED |
  UnitFlag.TAXI_FLIGHT |
  UnitFlag.CONFUSED |
  UnitFlag.FLEEING;

export function targetReason(
  deps: TargetDeps,
  guid: bigint,
  state: CombatState,
): string | undefined {
  const target = deps.entity(guid);
  const self = deps.entity(state.self.guid);
  if (!target) return "target_unobserved";
  if (!isUnit(target) || target.objectType !== ObjectType.UNIT)
    return "target_not_pve_creature";
  if (!isUnit(self) || state.self.health === undefined)
    return "self_unobserved";
  if (state.target?.health === undefined) return "target_vitals_unobserved";
  if (state.target.health === 0) return "target_dead";
  if (target.unitFlags & TARGET_BLOCK) return "target_not_attackable";
  if (self.unitFlags & SELF_BLOCK) return "self_cannot_act";
  if (
    deps.combat.isAttackingSelf(guid) ||
    (target.target === state.self.guid &&
      (target.unitFlags & UnitFlag.IN_COMBAT) !== 0)
  )
    return undefined;
  const relation = deps.relation(guid);
  if (relation === "friendly") return "target_friendly";
  if (relation === "unknown") return "unverified_hostile_relation";
  return undefined;
}
