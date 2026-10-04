import { bearing, distance2d, GROUND_ERROR, type NavPoint } from "@peon/core";
import { checkCollision } from "#harness/navigation/collision";
import { columnHeights, leadFloor } from "#harness/navigation/column";
import {
  groundError,
  isGroundError,
  type NativeMap,
  validateNativePoint,
} from "#harness/navigation/native";

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
      checkCollision(map, from, native, 0);
      checkLeadGround(map, from, native);
    } catch (stepError) {
      if (isGroundError(stepError)) throw error;
      throw stepError;
    }
    return native;
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

function checkLeadGround(map: NativeMap, from: NavPoint, onto: NavPoint): void {
  const span = distance2d(from, onto);
  const count = Math.max(2, Math.ceil(span / LEAD_PROBE_STEP));
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
  }
}
export function sampleLead(
  map: NativeMap,
  leg: { start: NavPoint; end: NavPoint; ratio: number },
  at: { x: number; y: number },
): NavPoint & { orientation: number; swimming: false } {
  const z = leg.start.z + (leg.end.z - leg.start.z) * leg.ratio;
  return {
    ...at,
    orientation: bearing(leg.start, leg.end),
    swimming: false,
    z: leadSurface(map, { ...at, z }, leg.start.z),
  };
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
