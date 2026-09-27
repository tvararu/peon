import { type EntityLookup, isUnit, UnitFlag } from "@peon/core";
import type { CombatPort, ControlPort } from "#harness/loops/ports";
import type { TacticsDefense } from "#harness/loops/tactics";

type DefenseDeps = {
  combat: Pick<CombatPort, "snapshot" | "isAttackingSelf" | "attack" | "halt">;
  control: Pick<ControlPort, "setLease" | "halt">;
  entity: EntityLookup;
};

export function defendTarget(
  deps: DefenseDeps,
  targetGuid: bigint,
): TacticsDefense {
  deps.control.setLease("manual");
  deps.control.halt();
  const state = deps.combat.snapshot(targetGuid);
  const selfGuid = state.self.guid;
  const target = deps.entity(targetGuid);
  const threatening =
    (state.target?.health ?? 0) > 0 &&
    isUnit(target) &&
    (deps.combat.isAttackingSelf(targetGuid) ||
      (target.target === selfGuid &&
        (target.unitFlags & UnitFlag.IN_COMBAT) !== 0));
  if (threatening) {
    const swinging = state.attacking && state.attackTarget === targetGuid;
    if (!swinging && state.pendingAttack !== targetGuid)
      deps.combat.attack(targetGuid);
    return "auto_attack";
  }
  deps.combat.halt();
  const self = deps.entity(selfGuid);
  return isUnit(self) && (self.unitFlags & UnitFlag.IN_COMBAT) !== 0
    ? "uncontrolled_in_combat"
    : "none";
}
