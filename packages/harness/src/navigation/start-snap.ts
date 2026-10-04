import { bearing, distance2d, GROUND_ERROR, type NavPoint } from "@peon/core";
import { checkCollision } from "#harness/navigation/collision";
import { columnHeights, leadFloor } from "#harness/navigation/column";
import {
  groundError,
  isGroundError,
  type NativeMap,
  validateNativePoint,
} from "#harness/navigation/native";
import { CORNER_RISE } from "#harness/navigation/swim";

const START_REACH = 0.5;
const LEAD_PROBE_STEP = 0.02;

export function startStep(
  map: NativeMap,
  from: NavPoint,
  native: NavPoint,
): NavPoint | undefined {
  try {
    rejectSnap("start", from, native);
    return undefined;
  } catch (error) {
    const reach = Math.hypot(
      native.x - from.x,
      native.y - from.y,
      native.z - from.z,
    );
    if (reach > START_REACH) throw error;
    try {
      checkLeadWalk(map, leadChain(map, from, native));
    } catch (stepError) {
      if (isGroundError(stepError)) throw error;
      throw stepError;
    }
    return native;
  }
}

function checkLeadWalk(map: NativeMap, walked: NavPoint[]): void {
  for (let index = 1; index < walked.length; index++) {
    const previous = walked[index - 1] as NavPoint;
    const next = walked[index] as NavPoint;
    checkCollision(map, previous, next, next.z < previous.z ? CORNER_RISE : 0);
  }
}

export function leadSurface(
  map: NativeMap,
  at: { x: number; y: number; z: number },
  fromZ: number,
): number {
  const surface = leadFloor(columnHeights(map, at.x, at.y), at.z, fromZ);
  if (surface === undefined)
    throw groundError("ambiguous ground column leaving start");
  return surface;
}

function leadChain(map: NativeMap, from: NavPoint, onto: NavPoint): NavPoint[] {
  const span = distance2d(from, onto);
  const count = Math.max(2, Math.ceil(span / LEAD_PROBE_STEP));
  const chain: NavPoint[] = [{ ...from }];
  let previous = from.z;
  for (let step = 1; step < count; step++) {
    const ratio = step / count;
    previous = leadSurface(
      map,
      {
        x: from.x + (onto.x - from.x) * ratio,
        y: from.y + (onto.y - from.y) * ratio,
        z: from.z + (onto.z - from.z) * ratio,
      },
      previous,
    );
    chain.push({
      x: from.x + (onto.x - from.x) * ratio,
      y: from.y + (onto.y - from.y) * ratio,
      z: previous,
    });
  }
  chain.push({ ...onto });
  return chain;
}
export function sampleBeyond(
  map: NativeMap,
  previous: NavPoint,
  stepped: NavPoint,
): void {
  checkCollision(
    map,
    previous,
    stepped,
    stepped.z < previous.z ? CORNER_RISE : 0,
  );
}

export function sampleLead(
  map: NativeMap,
  leg: { start: NavPoint; end: NavPoint; ratio: number },
  at: { x: number; y: number },
  previous?: NavPoint,
): NavPoint & { orientation: number; swimming: false } {
  const span = distance2d(leg.start, leg.end);
  const interpolated = {
    x: leg.start.x + (leg.end.x - leg.start.x) * leg.ratio,
    y: leg.start.y + (leg.end.y - leg.start.y) * leg.ratio,
    z: leg.start.z + (leg.end.z - leg.start.z) * leg.ratio,
  };
  const walked = leadChain(map, leg.start, leg.end);
  const anchor = anchorFloor(walked, leg.start, leg.ratio * span);
  const surface = leadSurface(map, interpolated, anchor);
  checkLeadWalk(
    map,
    previous === undefined
      ? walkedTo(walked, leg.start, { ...at, z: surface })
      : [previous, { ...at, z: surface }],
  );
  return {
    ...at,
    orientation: bearing(leg.start, leg.end),
    swimming: false,
    z: surface,
  };
}

function walkedTo(
  walked: NavPoint[],
  from: NavPoint,
  onto: NavPoint,
  direct = false,
): NavPoint[] {
  if (direct) return [from, onto];
  const points = [from];
  for (let index = 1; index < walked.length; index++) {
    const point = walked[index] as NavPoint;
    if (distance2d(from, point) >= distance2d(from, onto)) break;
    points.push(point);
  }
  points.push(onto);
  return points;
}

function anchorFloor(
  walked: NavPoint[],
  from: NavPoint,
  target: number,
): number {
  let anchor = from.z;
  for (let index = 1; index < walked.length - 1; index++) {
    const point = walked[index] as NavPoint;
    if (distance2d(from, point) > target) break;
    anchor = point.z;
  }
  return anchor;
}

export function rejectSnap(
  label: string,
  requested: NavPoint,
  actual: NavPoint,
): void {
  validateNativePoint(actual);
  const dx = Math.abs(actual.x - requested.x);
  const dy = Math.abs(actual.y - requested.y);
  const roundX = Math.abs(Math.fround(requested.x) - requested.x) + 1e-6;
  const roundY = Math.abs(Math.fround(requested.y) - requested.y) + 1e-6;
  if (
    dx > roundX ||
    dy > roundY ||
    Math.abs(actual.z - requested.z) > GROUND_ERROR
  ) {
    throw new Error(`${label} snapped off the requested ground position`);
  }
}
