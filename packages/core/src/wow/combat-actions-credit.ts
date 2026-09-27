import type { CombatState } from "#wow/combat";
import { type Entity, fieldOf, isUnit } from "#wow/entity-store";
import { UNIT_FIELDS, UnitFlag } from "#wow/protocol/entity-fields";
import type { TacticsFrame } from "#wow/tactics";

export const GRAY_KILL = "gray";
export const NO_XP_KILL = "no_xp_kill";
export const FOREIGN_TAP = "target_dead_tapped_by_other";
export const NO_CREDIT = "target_dead_without_server_credit";
const XP_WAIT_MS = 5000;
const LOOTABLE = 0x1;
const TAPPED = 0x4;
const TAPPED_BY_PLAYER = 0x8;

type Tap = "mine" | "other" | "unknown";
type Death = {
  target: Entity | undefined;
  state: CombatState;
  engaged: boolean;
  waitedMs: number;
};

export function grayLevel(level: number): number {
  if (level <= 5) return 0;
  if (level <= 39) return level - 5 - Math.floor(level / 10);
  if (level <= 59) return level - 1 - Math.floor(level / 5);
  return level - 9;
}

export function engagedWith(
  state: CombatState,
  target: Entity | undefined,
): boolean {
  const guid = state.target?.guid;
  if (guid === undefined) return false;
  if (state.attackTarget === guid || state.attackers.includes(guid))
    return true;
  if ([state.casting, state.pendingCast].some((cast) => cast?.target === guid))
    return true;
  return (
    isUnit(target) &&
    target.target === state.self.guid &&
    (target.unitFlags & UnitFlag.IN_COMBAT) !== 0
  );
}

function tapOf(target: Entity | undefined): Tap {
  const flags = isUnit(target)
    ? (fieldOf(target, UNIT_FIELDS.DYNAMIC_FLAGS.offset) ?? 0)
    : 0;
  if (flags & LOOTABLE || (flags & TAPPED && flags & TAPPED_BY_PLAYER))
    return "mine";
  return flags & TAPPED ? "other" : "unknown";
}

function gray(state: CombatState): boolean {
  const own = state.self.level;
  const level = state.target?.level;
  return own !== undefined && level !== undefined && level <= grayLevel(own);
}

export function deathOutcome(death: Death): TacticsFrame["outcome"] {
  const tap = tapOf(death.target);
  const credited = tap === "mine" || (tap === "unknown" && death.engaged);
  if (credited && gray(death.state))
    return { status: "completed", reason: GRAY_KILL };
  if (death.waitedMs <= XP_WAIT_MS) return undefined;
  if (tap === "mine") return { status: "completed", reason: NO_XP_KILL };
  return {
    status: "blocked",
    reason: tap === "other" ? FOREIGN_TAP : NO_CREDIT,
  };
}
