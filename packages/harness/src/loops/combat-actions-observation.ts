import {
  bearing,
  type CombatOutcome,
  type CombatState,
  type CombatUnit,
  distance,
} from "@peon/core";
import type { TacticsFrame } from "#harness/loops/tactics";
import type { NavigationState } from "#harness/navigation/route-follower";

export function timeoutOutcome(
  state: CombatState,
  now: number,
): TacticsFrame["outcome"] {
  if (state.pendingCast && now - state.pendingCast.startedAt > 5000)
    return { status: "failed", reason: "cast_response_timeout" };
  if (
    state.casting &&
    now - state.casting.startedAt > state.casting.durationMs + 5000
  )
    return { status: "failed", reason: "cast_completion_timeout" };
  return undefined;
}

export function separation(state: CombatState): number | undefined {
  const a = state.self.pose;
  const b = state.target?.pose;
  if (!(a && b) || a.mapId !== b.mapId) return undefined;
  return distance(a, b);
}

export function facing(state: CombatState): boolean {
  const a = state.self.pose;
  const b = state.target?.pose;
  if (!(a && b) || a.orientation === undefined) return false;
  const angle = bearing(a, b) - a.orientation;
  return Math.cos(angle) >= 0;
}

export function hex(guid: bigint | undefined): string | undefined {
  return guid === undefined ? undefined : `0x${guid.toString(16)}`;
}

export function unitObservation(unit: CombatUnit): Record<string, unknown> {
  return { ...unit, guid: hex(unit.guid) };
}

export function auraObservation(
  aura: CombatState["auras"][number],
): Record<string, unknown> {
  return { ...aura, caster: hex(aura.caster) };
}

export function navigationObservation(
  state: NavigationState,
): Record<string, unknown> {
  return { ...state, target: hex(state.target) };
}

export function outcomeObservation(
  outcome: CombatOutcome,
): Record<string, unknown> {
  const { kind, status, spellId, result, reason, error, at } = outcome;
  return { kind, status, spellId, result, reason, error, at };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function nulled(value: unknown): unknown {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(nulled);
  return isPlainRecord(value) ? withNulls(value) : value;
}

export function withNulls(
  record: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, nulled(value)]),
  );
}
