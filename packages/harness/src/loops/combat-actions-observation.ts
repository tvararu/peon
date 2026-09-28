import {
  type AreaState,
  bearing,
  type CombatOutcome,
  type CombatState,
  type CombatUnit,
  distance,
} from "@peon/core";
import { creatureEntry, isDamage } from "#harness/areas/combatlog/totals";
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

const RECENT_MS = 6000;

export const RANGE_HELD_REASONS: ReadonlySet<string> = new Set([
  "cooldown",
  "insufficient_mana",
  "aura_already_present",
  "caster_aura_required",
  "target_aura_required",
  "too_close",
  "auto_shot_active",
  "immune",
]);

export function immuneTo(
  log: AreaState<"combatlog"> | undefined,
  targetGuid: bigint,
  spellId: number,
): boolean {
  const entry = creatureEntry(targetGuid);
  return (
    entry !== undefined &&
    (log?.immunities.some(
      (known) => known.entry === entry && known.spellId === spellId,
    ) ??
      false)
  );
}

function damageTaken(
  log: AreaState<"combatlog">,
  now: number,
  self: bigint,
): Record<string, unknown>[] {
  const groups = new Map<string, Record<string, unknown>>();
  for (const entry of log.entries) {
    if (entry.at < now - RECENT_MS || !isDamage(entry.kind)) continue;
    if (entry.target !== self) continue;
    const key = `${entry.source}:${entry.schoolMask ?? 0}`;
    const group = groups.get(key) ?? {
      amount: 0,
      schoolMask: entry.schoolMask,
      source: hex(entry.source),
    };
    group["amount"] = Number(group["amount"]) + entry.amount;
    groups.set(key, group);
  }
  return [...groups.values()];
}

function ownMisses(
  log: AreaState<"combatlog">,
  now: number,
  self: bigint,
): Record<string, unknown>[] {
  const counts = new Map<string, number>();
  for (const entry of log.entries)
    if (
      entry.source === self &&
      entry.outcome !== undefined &&
      entry.at >= now - RECENT_MS
    )
      counts.set(entry.outcome, (counts.get(entry.outcome) ?? 0) + 1);
  return [...counts].map(([outcome, count]) => ({ count, outcome }));
}

export function combatLogObservation(
  log: AreaState<"combatlog"> | undefined,
  init: { now: number; self: bigint; target: bigint },
): Record<string, unknown> {
  const { now, self, target } = init;
  if (!log)
    return { comboPoints: 0, damageTaken: [], immunities: [], misses: [] };
  const entry = creatureEntry(target);
  return {
    comboPoints:
      log.comboPoints?.target === target ? log.comboPoints.points : 0,
    damageTaken: damageTaken(log, now, self),
    immunities: log.immunities
      .filter((known) => known.entry === entry)
      .map((known) => known.spellId),
    misses: ownMisses(log, now, self),
  };
}
