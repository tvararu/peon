import {
  CELL_HEIGHT,
  distance2d,
  GROUND_ERROR,
  type NavPoint,
  WALKABLE_CLIMB,
} from "@peon/core";
import { checkCollision } from "#harness/navigation/collision";
import { groundFloors } from "#harness/navigation/column";
import { traceHeight } from "#harness/navigation/height";
import {
  groundError,
  isGroundError,
  type NativeMap,
  validateNativePoint,
} from "#harness/navigation/native";

export type StepRules = {
  climb: number;
  columnFallback: boolean;
  ambiguity: string;
  continuity: boolean;
};

export type SwimStep = {
  point: NavPoint;
  heights: number[];
  swimming: boolean;
};

type Probe = { x: number; y: number };

export const ROUTE_AMBIGUITY = "ambiguous ground column at route";
export const START_EXIT_AMBIGUITY = "ambiguous ground column leaving start";
export const CORNER_RISE = WALKABLE_CLIMB + CELL_HEIGHT;
export const GROUND_STEP = 0.5;

const ENTRY_DROP = 5;
const WADING_DEPTH = 1;
const SWIM_DEPTH = 0.6;
const SHALLOW_WADE = 0.15;

export function surfaceAt(
  map: NativeMap,
  at: Probe,
  referenceZ: number,
): number | undefined {
  map.loadAdtAt(at.x, at.y);
  const surface = map.findLiquid({ x: at.x, y: at.y, z: referenceZ });
  if (surface === undefined) return undefined;
  if (referenceZ > surface && !belowSurface(map, at, surface)) return undefined;
  const bed = bedAt(map, at, surface);
  if (bed !== undefined && surface - bed < SWIM_DEPTH) return undefined;
  return surface;
}

export type StepAttempt = {
  map: NativeMap;
  from: NavPoint;
  fromSwimming: boolean;
  at: Probe;
  rules: StepRules;
  ground: (from: NavPoint, at: Probe) => SwimStep;
};

export function routeStep(step: StepAttempt): SwimStep {
  const { from, fromSwimming, at, rules, ground } = step;
  const surface = surfaceAt(step.map, at, from.z);
  const wet: EnterWater = {
    at,
    climb: rules.climb,
    from,
    map: step.map,
    surface: surface ?? 0,
  };
  if (surface !== undefined && Math.abs(surface - from.z) <= ENTRY_DROP)
    return enterWater(wet);
  if (!fromSwimming) return ground(from, at);
  if (surface !== undefined) return enterWater(wet);
  return exitWater(step.map, from, at, rules);
}

function entering(
  fromZ: number,
  wet: number,
  surface: number,
  climb: number,
): boolean {
  const rise = surface - fromZ;
  if (-rise > ENTRY_DROP) return false;
  if (rise <= climb) return true;
  return wet - fromZ <= climb;
}

function belowSurface(map: NativeMap, at: Probe, surface: number): boolean {
  return map
    .findHeights(at.x, at.y)
    .some((height) => height < surface - SHALLOW_WADE);
}

function bedAt(map: NativeMap, at: Probe, surface: number): number | undefined {
  let bed: number | undefined;
  for (const height of map.findHeights(at.x, at.y)) {
    if (height < surface && (bed === undefined || height > bed)) bed = height;
  }
  return bed;
}

export function waterStart(map: NativeMap, from: NavPoint): NavPoint {
  const surface = surfaceAt(map, from, from.z);
  if (surface === undefined) return from;
  if (Math.abs(surface - from.z) > GROUND_ERROR) return from;
  return { x: from.x, y: from.y, z: surface };
}

type EnterWater = {
  map: NativeMap;
  from: NavPoint;
  at: Probe;
  surface: number;
  climb: number;
};

function enterWater({ map, from, at, surface, climb }: EnterWater): SwimStep {
  const wet = bedAt(map, at, surface) ?? surface;
  if (!entering(from.z, wet, surface, climb))
    throw groundError("shore above the swim step");
  const point = { x: at.x, y: at.y, z: surface };
  checkCollision(map, from, point, Math.max(climb, WALKABLE_CLIMB));
  return { heights: [surface], point, swimming: true };
}

function exitWater(
  map: NativeMap,
  from: NavPoint,
  at: Probe,
  { climb, columnFallback }: StepRules,
): SwimStep {
  let landed: number;
  try {
    landed = traceHeight(map, from, at, columnFallback);
  } catch (error) {
    if (!isGroundError(error)) throw error;
    throw groundError("shore beyond the swim step");
  }
  const wet = surfaceAt(map, from, from.z) ?? from.z;
  const rise = landed - from.z;
  const wading =
    rise > 0 && wet - from.z <= WADING_DEPTH && landed - wet <= climb;
  if ((rise > climb && !wading) || -rise > climb)
    throw groundError("shore above the swim step");
  const point = { x: at.x, y: at.y, z: landed };
  checkCollision(map, from, point, climb);
  return { heights: [landed], point, swimming: false };
}
export type CornerStepper = (
  tail: NavPoint,
  at: { x: number; y: number },
  rules: StepRules,
) => SwimStep;

export type CornerWalk = {
  points: NavPoint[];
  swims: boolean[];
  leavingStart: boolean;
  rules: { climb: number; columnFallback: boolean };
};

export function stepCorner(
  walk: CornerWalk,
  from: NavPoint,
  to: NavPoint,
  cornerStep: CornerStepper,
): NavPoint {
  validateNativePoint(to);
  const span = distance2d(from, to);
  if (span === 0 && Math.abs(to.z - from.z) > GROUND_ERROR)
    throw groundError("unsupported vertical ground route");
  const count = Math.ceil(span / GROUND_STEP);
  for (let step = 1; step <= count; step++) {
    const ratio = step / count;
    const tail = walk.points.at(-1);
    if (tail === undefined) throw new Error("ground route point missing");
    const swim = walk.swims.at(-1) ?? false;
    const made = cornerStep(
      tail,
      {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      },
      {
        ...walk.rules,
        ambiguity: walk.leavingStart ? START_EXIT_AMBIGUITY : ROUTE_AMBIGUITY,
        continuity: !walk.leavingStart,
      },
    );
    void swim;
    walk.points.push(made.point);
    walk.swims.push(made.swimming);
    walk.leavingStart &&= groundFloors(made.heights).length > 1;
  }
  const corner = walk.points.at(-1);
  if (corner === undefined) throw new Error("ground route point missing");
  return corner;
}

export type CornerCheck = {
  corner: NavPoint;
  to: NavPoint;
  swimTo: number | undefined;
  interior: boolean;
};

export function cornerMatches(
  map: NativeMap,
  { corner, to, swimTo, interior }: CornerCheck,
): boolean {
  if (swimTo !== undefined) return Math.abs(corner.z - swimTo) <= GROUND_ERROR;
  if (!interior) return Math.abs(corner.z - to.z) <= GROUND_ERROR;
  return meshCornerOnGround(map, corner, to.z);
}

function meshCornerOnGround(
  map: NativeMap,
  ground: NavPoint,
  meshZ: number,
): boolean {
  const rise = meshZ - ground.z;
  if (rise < -GROUND_ERROR) return false;
  if (rise <= CORNER_RISE)
    return map
      .findHeights(ground.x, ground.y)
      .every(
        (height) =>
          Math.abs(height - ground.z) <= GROUND_ERROR ||
          Math.abs(height - meshZ) > Math.abs(rise),
      );
  return map
    .findHeights(ground.x, ground.y)
    .every((height) => Math.abs(height - meshZ) > CORNER_RISE);
}
