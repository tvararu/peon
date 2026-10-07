import {
  type CombatState,
  type EntityLookup,
  isUnit,
  type NearbyRow,
  type SpellDefinition,
} from "@peon/core";
import type { JevCandidate } from "#harness/jev/contract";
import type { ActionDeps } from "#harness/loops/combat-actions-frame";
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
import type { TacticsContext } from "#harness/loops/tactics";

export const COMBAT_MELEE_DISTANCE_YD = 5;

export type CombatMovesInput = {
  deps: ActionDeps;
  context: TacticsContext;
  state: CombatState;
};

export function meleeReachOf(
  state: CombatState,
  entity: EntityLookup,
): number | undefined {
  const target = state.target;
  if (!target) return undefined;
  const self = entity(state.self.guid);
  const foe = entity(target.guid);
  const a = isUnit(self) ? self.combatReach : undefined;
  const b = isUnit(foe) ? foe.combatReach : undefined;
  if (a === undefined || b === undefined) return COMBAT_MELEE_DISTANCE_YD;
  return Math.max(COMBAT_MELEE_DISTANCE_YD, a + b + 4 / 3);
}

export function targetGap(
  state: CombatState,
  entity: EntityLookup,
): number | undefined {
  const gap = separation(state);
  if (gap === undefined) return undefined;
  const reach = meleeReachOf(state, entity);
  if (reach === undefined) return undefined;
  return Math.round((gap - reach) * 10) / 10;
}

function selfPoseOf(input: CombatMovesInput) {
  const snapshot = input.deps.control.snapshot();
  const pose = snapshot.pose;
  if (!pose) return;
  return poseOf(pose, snapshot.speed, snapshot.airborne);
}

function foePointOf(state: CombatState) {
  const pose = state.target?.pose;
  if (!pose || state.self.pose?.mapId !== pose.mapId) return;
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
  if (!pose)
    return { circles: [], lines: "none in view" as const, rows: nearby };
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
  if (!(pose && foe)) return [];
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

function travelHeading(option: PilotOption): number | undefined {
  const { input } = option;
  if (!input) return undefined;
  if (input.move === "backward") return option.heading + Math.PI;
  if (input.strafe === "left") return option.heading + Math.PI / 2;
  if (input.strafe === "right") return option.heading - Math.PI / 2;
  return input.move === "forward" ? option.heading : undefined;
}

export function combatDangerText(input: CombatMovesInput): string {
  const pose = selfPoseOf(input);
  if (!pose) return "danger: position unobserved";
  const { circles, lines } = rangeCircles(input);
  const units = Array.isArray(lines) ? lines.join(" | ") : lines;
  if (!foePointOf(input.state))
    return `units: ${units}; danger: target unobserved`;
  const hits = combatMoves(input).flatMap((option) => {
    const heading = travelHeading(option);
    if (heading === undefined) return [];
    const hit = dangerAlong(pose, heading, circles, DANGER_ANNOTATE_YD);
    return hit
      ? [
          `${option.id} enters ${hit.name}'s range after ${Math.round(hit.yd)} yd`,
        ]
      : [];
  });
  const line =
    hits.length === 0
      ? "no offered move crosses an inferred range"
      : hits.join("; ");
  return `units: ${units}; danger: ${line}`;
}

export function closingText(
  state: CombatState,
  entity: EntityLookup,
  previous: number | undefined,
): string {
  const gap = targetGap(state, entity);
  if (gap === undefined || previous === undefined) return "unknown";
  if (gap < previous) return "closing";
  if (gap > previous) return "opening";
  return "holding";
}

const AURA_MOD_ROOT = 26;
const AURA_MOD_DECREASE_SPEED = 33;

export type Snare = { name: string; kind: "root" | "slow" };

export function snares(
  state: CombatState,
  definition: (id: number) => SpellDefinition | undefined,
): Snare[] {
  return state.targetAuras.flatMap((aura): Snare[] => {
    const effects = definition(aura.spellId)?.effects ?? [];
    const name = aura.name ?? `spell ${aura.spellId}`;
    if (effects.some((effect) => effect.applyAura === AURA_MOD_ROOT))
      return [{ kind: "root", name }];
    if (effects.some((effect) => effect.applyAura === AURA_MOD_DECREASE_SPEED))
      return [{ kind: "slow", name }];
    return [];
  });
}
