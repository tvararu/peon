import { distance2d, GROUND_ERROR, type NavPoint } from "@peon/core";
import { checkCollision } from "#harness/navigation/collision";
import {
  clearAbove,
  columnHeights,
  groundFloors,
} from "#harness/navigation/column";
import {
  groundError,
  isGroundError,
  type NativeMap,
  validateNativePoint,
} from "#harness/navigation/native";
import { GROUND_STEP } from "#harness/navigation/swim";

const START_REACH = 0.5;

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

function checkLeadGround(map: NativeMap, from: NavPoint, onto: NavPoint): void {
  const span = distance2d(from, onto);
  const count = Math.max(2, Math.ceil(span / GROUND_STEP));
  for (let step = 1; step < count; step++) {
    const ratio = step / count;
    const x = from.x + (onto.x - from.x) * ratio;
    const y = from.y + (onto.y - from.y) * ratio;
    const z = from.z + (onto.z - from.z) * ratio;
    const heights = columnHeights(map, x, y);
    if (
      !(
        heights.some((height) => Math.abs(height - z) <= GROUND_ERROR) &&
        clearAbove(heights, z)
      ) ||
      groundFloors(heights).length !== 1
    )
      throw groundError("ambiguous ground column leaving start");
  }
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
