import type { CombatState, NearbyRow } from "@peon/core";
import type { JevCandidate } from "#harness/jev/contract";
import { separation } from "#harness/loops/combat-actions-observation";
import { poseOf } from "#harness/loops/pilot-geometry";
import {
  buildOptions,
  DANGER_ANNOTATE_YD,
  type PilotOption,
} from "#harness/loops/pilot-options";
import {
  aggroCircles,
  buildPilotUnits,
  dangerAlong,
  dangerUnits,
  unitLines,
} from "#harness/loops/pilot-units";
import type { ActionDeps } from "#harness/loops/combat-actions-frame";
import type { TacticsContext } from "#harness/loops/tactics";

export const COMBAT_MELEE_DISTANCE_YD = 5;

export type CombatMovesInput = {
  deps: ActionDeps;
  context: TacticsContext;
  state: CombatState;
};

export function meleeReachOf(state: CombatState): number | undefined {
  const target = state.target;
  if (!target) return undefined;
  return COMBAT_MELEE_DISTANCE_YD;
}

export function targetGap(state: CombatState): number | undefined {
  const gap = separation(state);
  if (gap === undefined) return undefined;
  const reach = meleeReachOf(state);
  if (reach === undefined) return undefined;
  return Math.round((gap - reach) * 10) / 10;
}

function selfPoseOf(input: CombatMovesInput) {
  const snapshot = input.deps.control.snapshot();
  const pose = snapshot.pose;
  if (!pose) return undefined;
  return poseOf(pose, snapshot.speed, snapshot.airborne);
}

function foePointOf(state: CombatState) {
  const pose = state.target?.pose;
  if (!pose || state.self.pose?.mapId !== pose.mapId) return undefined;
  return { x: pose.x, y: pose.y };
}

function excludedGuids(input: CombatMovesInput): Set<bigint> {
  const excluded = new Set<bigint>([input.context.targetGuid]);
  for (const guid of input.state.attackers) excluded.add(guid);
  return excluded;
}

function rangeCircles(input: CombatMovesInput) {
  const nearby = input.deps.nearby?.() ?? [];
  const pose = selfPoseOf(input);
  if (!pose) return { circles: [], lines: "none in view" as const, rows: nearby };
  const listed = buildPilotUnits(nearby, pose, input.deps.aggro);
  const excluded = excludedGuids(input);
  const circles = aggroCircles(
    dangerUnits(nearby, pose, input.deps.aggro, (unit) =>
      excluded.has(unit.guid),
    ),
  );
  const rows: readonly NearbyRow[] = nearby;
  return { circles, lines: unitLines(listed, pose), rows };
}

export function combatMoves(input: CombatMovesInput): PilotOption[] {
  const pose = selfPoseOf(input);
  const foe = foePointOf(input.state);
  if (!pose || !foe) return [];
  const { circles } = rangeCircles(input);
  return buildOptions({
    circles,
    ground: input.deps.ground,
    jump: false,
    objective: { kind: "foe", x: foe.x, y: foe.y },
    pose,
  });
}

export function combatMoveCandidates(input: CombatMovesInput): JevCandidate[] {
  return combatMoves(input).map((option) => ({
    description: option.description,
    id: option.id,
  }));
}

export function combatMoveOption(
  input: CombatMovesInput,
  id: string,
): PilotOption | undefined {
  return combatMoves(input).find((option) => option.id === id);
}

export function combatDangerText(input: CombatMovesInput): string {
  const pose = selfPoseOf(input);
  if (!pose) return "danger: position unobserved";
  const { circles, lines } = rangeCircles(input);
  const units = Array.isArray(lines) ? lines.join(" | ") : lines;
  const foe = foePointOf(input.state);
  if (!foe) return `units: ${units}; danger: target unobserved`;
  const heading = Math.atan2(foe.y - pose.y, foe.x - pose.x);
  const hit = dangerAlong(pose, heading, circles, DANGER_ANNOTATE_YD);
  const line =
    hit === undefined
      ? "the way to the target crosses no inferred range"
      : `the way to the target enters ${hit.name}'s range after ${Math.round(hit.yd)} yd`;
  return `units: ${units}; danger: ${line}`;
}

export function closingText(
  state: CombatState,
  previous: number | undefined,
): string {
  const gap = targetGap(state);
  if (gap === undefined || previous === undefined) return "unknown";
  if (gap < previous) return "closing";
  if (gap > previous) return "opening";
  return "holding";
}

export function snareNames(state: CombatState): string[] {
  return state.targetAuras.map((aura) => aura.name ?? `spell ${aura.spellId}`);
}
