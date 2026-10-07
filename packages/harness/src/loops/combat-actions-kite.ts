import {
  type CombatState,
  type GroundOracle,
  type MovementInput,
  normalizeAngle,
} from "@peon/core";
import type { ActionDeps } from "#harness/loops/combat-actions-frame";
import { PILOT_DEADMAN_MS } from "#harness/loops/pilot-actions";
import {
  PILOT_MIN_CLEAR_YD,
  PILOT_RANGE_YD,
  type PilotPose,
  poseOf,
  relativeDeg,
  scanHeading,
} from "#harness/loops/pilot-geometry";
import {
  circleMasked,
  DANGER_ANNOTATE_YD,
  goalDegAfterTurn,
  type PilotOption,
} from "#harness/loops/pilot-options";
import {
  type AggroCircle,
  aggroCircles,
  dangerAlong,
  dangerUnits,
  hazardText,
} from "#harness/loops/pilot-units";
import type { ControlPort } from "#harness/loops/ports";
import type { TacticsContext } from "#harness/loops/tactics";

export const KITE_RETREAT_GAP_YD = 8;
export const KITE_CLOSING_RANGE_YD = 12;
export const KITE_RANGE_MARGIN_YD = 3;
export const KITE_MASK_MS = 4000;
export const KITE_RUN_LEG_YD = 10;
export const KITE_SELF_SNARE_YD = 10;

export const KITE_FIGHT_GUIDANCE =
  "kite the target: keep it outside its melee reach; open with a slow at range and keep casting while the gap is open; root it (Frost Nova) when it reaches melee unrooted, run away while it is rooted or slowed, then turn and cast again once the gap is open";

export const KITE_MOVE_REFUSALS: Record<string, true> = {
  ground_height_unavailable: true,
  height_unresolved: true,
  obstructed: true,
  too_steep: true,
};

export type KiteContext = TacticsContext & { kite?: boolean };

export function kiteOf(context: TacticsContext): boolean {
  return (context as KiteContext).kite === true;
}

type RangedAction = {
  spell?: { range?: { maxHostile: number } | undefined } | undefined;
  target: bigint;
  supported: boolean;
};

export function longestHostileRange(
  spells: readonly RangedAction[],
  targetGuid: bigint,
): number | undefined {
  let longest: number | undefined;
  for (const action of spells) {
    if (action.target !== targetGuid || !action.supported || !action.spell)
      continue;
    const max = action.spell.range?.maxHostile;
    if (max === undefined) continue;
    if (longest === undefined || max > longest) longest = max;
  }
  return longest;
}

export type KiteWatch = {
  masked: Map<string, number>;
  pending: { id: string; heading: number | undefined } | undefined;
  now: () => number;
};

export function kiteWatch(deps: Pick<ActionDeps, "now">): KiteWatch {
  return { masked: new Map(), now: deps.now, pending: undefined };
}

export function resetKite(watch: KiteWatch): void {
  watch.masked.clear();
  watch.pending = undefined;
}

export function recordKiteMove(
  watch: KiteWatch,
  id: string,
  heading: number | undefined,
): void {
  watch.pending = { heading, id };
}

export function maskPendingMove(watch: KiteWatch): void {
  const pending = watch.pending;
  watch.pending = undefined;
  if (pending === undefined) return;
  watch.masked.set(
    maskKey(pending.id, pending.heading),
    watch.now() + KITE_MASK_MS,
  );
}

export function maskKey(id: string, heading: number | undefined): string {
  if (id === "run_away" && heading !== undefined)
    return `${id}@${Math.round((normalizeAngle(heading) * 8) / Math.PI)}`;
  return id;
}

export function kiteMasked(watch: KiteWatch, key: string): boolean {
  const until = watch.masked.get(key);
  if (until === undefined) return false;
  if (until <= watch.now()) {
    watch.masked.delete(key);
    return false;
  }
  return true;
}

export type MovePlacement = {
  pose: PilotPose;
  foe: { x: number; y: number } | undefined;
  circles: readonly AggroCircle[];
};

export function movePlacement(
  deps: Pick<ActionDeps, "control" | "nearby" | "aggro">,
  context: TacticsContext,
  state: CombatState,
): MovePlacement | undefined {
  const snapshot = deps.control.snapshot();
  const pose = snapshot.pose;
  if (!pose) return undefined;
  const pilot = poseOf(pose, snapshot.speed, snapshot.airborne);
  const nearby = deps.nearby?.() ?? [];
  const excluded = new Set<bigint>([context.targetGuid]);
  for (const guid of state.attackers) excluded.add(guid);
  const circles = aggroCircles(
    dangerUnits(nearby, pilot, deps.aggro, (unit) => excluded.has(unit.guid)),
  );
  const target = state.target?.pose;
  const foe =
    target && state.self.pose?.mapId === target.mapId
      ? { x: target.x, y: target.y }
      : undefined;
  return { circles, foe, pose: pilot };
}

function strafeSide(strafe: MovementInput["strafe"]): number {
  if (strafe === "left") return 1;
  if (strafe === "right") return -1;
  return 0;
}

export function travelHeadingOf(
  input: MovementInput,
  orientation: number,
): number {
  if (input.turn === "left") return normalizeAngle(orientation + Math.PI / 2);
  if (input.turn === "right") return normalizeAngle(orientation - Math.PI / 2);
  const side = strafeSide(input.strafe);
  if (input.move === "forward")
    return normalizeAngle(orientation + (side * Math.PI) / 4);
  if (input.move === "backward")
    return normalizeAngle(orientation + Math.PI - (side * Math.PI) / 4);
  if (side !== 0) return normalizeAngle(orientation + (side * Math.PI) / 2);
  return orientation;
}

export function headingLegal(input: {
  ground: GroundOracle | undefined;
  placement: MovePlacement;
  heading: number;
}): boolean {
  const scan = scanHeading(input.ground, input.placement.pose, input.heading);
  if (scan.freeYd < PILOT_MIN_CLEAR_YD) return false;
  return !circleMasked(
    input.placement.pose,
    input.heading,
    input.placement.circles,
  );
}

export type KiteOffers = {
  retreat: boolean;
  approach: boolean;
};

export function kiteOffers(input: {
  gap: number | undefined;
  separation: number | undefined;
  longest: number | undefined;
  closing: boolean;
}): KiteOffers {
  const { closing, gap, longest, separation } = input;
  const retreat =
    (gap !== undefined && gap < KITE_RETREAT_GAP_YD) ||
    (closing &&
      separation !== undefined &&
      separation <= KITE_CLOSING_RANGE_YD);
  return {
    approach: longest !== undefined && (separation ?? 0) > longest,
    retreat,
  };
}

type RunAwayInput = {
  ground: GroundOracle | undefined;
  placement: MovePlacement;
  longest: number | undefined;
};

export function runAwayOption(input: RunAwayInput): PilotOption | undefined {
  const { ground, longest, placement } = input;
  const foe = placement.foe;
  if (!foe) return undefined;
  const heading = normalizeAngle(
    Math.atan2(placement.pose.y - foe.y, placement.pose.x - foe.x),
  );
  const scan = scanHeading(ground, placement.pose, heading);
  if (scan.freeYd < PILOT_MIN_CLEAR_YD) return undefined;
  if (circleMasked(placement.pose, heading, placement.circles))
    return undefined;
  const leg = Math.min(scan.freeYd, PILOT_RANGE_YD, KITE_RUN_LEG_YD);
  const endX = placement.pose.x + Math.cos(heading) * leg;
  const endY = placement.pose.y + Math.sin(heading) * leg;
  const endGap = Math.hypot(endX - foe.x, endY - foe.y);
  if (longest !== undefined && endGap > longest - KITE_RANGE_MARGIN_YD)
    return undefined;
  const hazard = dangerAlong(
    placement.pose,
    heading,
    placement.circles,
    DANGER_ANNOTATE_YD,
  );
  const danger = hazardText(hazard);
  const objective = { kind: "foe" as const, x: foe.x, y: foe.y };
  return {
    description:
      `Run directly away from the target at full speed for ${leg} yd; ` +
      `the target would be ${Math.round(endGap * 10) / 10} yd behind you${danger}.`,
    goalDeg: goalDegAfterTurn(objective, placement.pose, heading),
    heading,
    id: "run_away",
    input: { move: "forward" },
    turnDeg: Math.round(relativeDeg(heading, placement.pose.orientation)),
  };
}

export function waitRenewal(input: {
  ground: GroundOracle | undefined;
  placement: MovePlacement;
  orientation: number;
  current: MovementInput;
}): MovementInput | undefined {
  const heading = travelHeadingOf(input.current, input.orientation);
  if (
    !headingLegal({
      ground: input.ground,
      heading,
      placement: input.placement,
    })
  )
    return undefined;
  return input.current;
}

export function driveKiteMove(
  control: Pick<ControlPort, "drive" | "face" | "snapshot">,
  watch: KiteWatch,
  move: { heading: number; id: string; input: MovementInput | undefined },
  kite: boolean,
): void {
  if (!move.input) return;
  recordKiteMove(watch, move.id, move.heading);
  try {
    control.face(move.heading);
    control.drive(move.input, PILOT_DEADMAN_MS);
  } catch (error) {
    const reason = control.snapshot().blockedReason;
    if (kite && reason !== undefined && KITE_MOVE_REFUSALS[reason] === true) {
      maskPendingMove(watch);
      return;
    }
    throw error;
  }
}

export function kiteSpellSuffix(
  spell: { effects: readonly { applyAura: number; effect: number }[] },
  kite: boolean,
): string {
  if (!kite) return "";
  const live = spell.effects.filter((effect) => effect.effect !== 0);
  if (live.some((effect) => effect.applyAura === 26))
    return "; roots the target in place";
  if (live.some((effect) => effect.applyAura === 33))
    return "; slows the target";
  return "";
}

type SnareCandidate = {
  spell?: { effects: readonly { applyAura: number; effect: number }[] };
  target: bigint;
};

export function slowFirst<T extends SnareCandidate>(
  ready: readonly T[],
  input: {
    distance: number | undefined;
    selfGuid: bigint;
    snared: boolean;
  },
): readonly T[] {
  if (input.snared) return ready;
  const snaring = ready.filter(
    (action) =>
      action.spell !== undefined &&
      kiteSpellSuffix(action.spell, true) !== "" &&
      (action.target !== input.selfGuid ||
        (input.distance ?? Number.POSITIVE_INFINITY) <= KITE_SELF_SNARE_YD),
  );
  return snaring.length > 0 ? snaring : ready;
}

export function kiteHolding(input: {
  distance: number | undefined;
  longest: number | undefined;
  gap: number | undefined;
  previous: number | undefined;
}): boolean {
  if (input.distance === undefined) return false;
  if (input.longest !== undefined && input.distance <= input.longest)
    return true;
  return (
    input.gap !== undefined &&
    input.previous !== undefined &&
    input.gap < input.previous &&
    input.distance <= KITE_CLOSING_RANGE_YD
  );
}

export function kiteMelee(input: {
  closing: boolean;
  retreat: boolean;
  found: readonly { kind: string; name: string }[];
}): {
  closing: boolean;
  retreat: boolean;
  roots: string[];
  slows: string[];
} {
  return {
    closing: input.closing,
    retreat: input.retreat,
    roots: input.found
      .filter((snare) => snare.kind === "root")
      .map((snare) => snare.name),
    slows: input.found
      .filter((snare) => snare.kind === "slow")
      .map((snare) => snare.name),
  };
}
