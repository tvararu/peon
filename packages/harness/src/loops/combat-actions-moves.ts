import {
  type CombatState,
  type EntityLookup,
  isUnit,
  type NearbyRow,
  type SpellDefinition,
} from "@peon/core";
import type { JevCandidate } from "#harness/jev/contract";
import type { ActionDeps } from "#harness/loops/combat-actions-frame";
import {
  KITE_CLOSING_RANGE_YD,
  kiteOf,
  kiteOffers,
  longestHostileRange,
  maskKey,
  movePlacement,
  runAwayOption,
} from "#harness/loops/combat-actions-kite";
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

export type MoveSpell = {
  spell?: { range?: { maxHostile: number } | undefined } | undefined;
  target: bigint;
  supported: boolean;
};
export const COMBAT_MELEE_LEEWAY_YD = 2.66;

export type CombatMovesInput = {
  deps: ActionDeps;
  context: TacticsContext;
  state: CombatState;
  previousGap?: number | undefined;
  spells?: readonly MoveSpell[];
  masked?: (id: string) => boolean;
};

export function meleeReachOf(
  state: CombatState,
  entity: EntityLookup,
  kite = false,
): number | undefined {
  const target = state.target;
  if (!target) return undefined;
  const self = entity(state.self.guid);
  const foe = entity(target.guid);
  const a = isUnit(self) ? self.combatReach : undefined;
  const b = isUnit(foe) ? foe.combatReach : undefined;
  const base =
    a === undefined || b === undefined
      ? COMBAT_MELEE_DISTANCE_YD
      : Math.max(COMBAT_MELEE_DISTANCE_YD, a + b + 4 / 3);
  return kite ? base + COMBAT_MELEE_LEEWAY_YD : base;
}

export function targetGap(
  state: CombatState,
  entity: EntityLookup,
  kite = false,
): number | undefined {
  const gap = separation(state);
  if (gap === undefined) return undefined;
  const reach = meleeReachOf(state, entity, kite);
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
  const kite = kiteOf(input.context);
  const pose = selfPoseOf(input);
  const foe = foePointOf(input.state);
  if (!(pose && foe)) return [];
  const { circles } = rangeCircles(input);
  const moves = buildOptions({
    circles,
    ground: input.deps.ground,
    jump: false,
    objective: { kind: "foe", x: foe.x, y: foe.y },
    pose,
  });
  if (!kite) return moves;
  const longest = longestHostileRange(
    input.spells ?? [],
    input.context.targetGuid,
  );
  const gap = targetGap(input.state, input.deps.entity, true);
  const distance = separation(input.state);
  const offers = kiteOffers({
    closing:
      input.previousGap !== undefined &&
      gap !== undefined &&
      gap < input.previousGap &&
      (distance ?? Number.POSITIVE_INFINITY) <= KITE_CLOSING_RANGE_YD,
    gap,
    longest,
    separation: distance,
  });
  const kept = moves.filter((option) => kiteKeeps(option, offers, input));
  if (!offers.retreat) return kept;
  const placement = movePlacement(
    {
      aggro: input.deps.aggro,
      control: input.deps.control,
      nearby: input.deps.nearby,
    },
    input.context,
    input.state,
  );
  if (!placement) return kept;
  const away = runAwayOption({
    ground: input.deps.ground,
    longest,
    placement,
  });
  if (!away || input.masked?.(maskKey(away.id, away.heading))) return kept;
  return [...kept, away];
}

function kiteKeeps(
  option: PilotOption,
  offers: { approach: boolean; retreat: boolean },
  input: CombatMovesInput,
): boolean {
  if (option.id === "stop") return true;
  if (option.id === "back_up") return false;
  if (input.masked?.(option.id)) return false;
  if (
    option.id === "run_ahead" ||
    option.id === "veer_left" ||
    option.id === "veer_right"
  )
    return offers.approach;
  return offers.retreat || offers.approach;
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
  kite = false,
): string {
  const gap = targetGap(state, entity, kite);
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
