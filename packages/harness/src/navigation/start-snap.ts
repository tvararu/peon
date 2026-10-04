import { GROUND_ERROR, type NavPoint } from "@peon/core";
import { checkCollision } from "#harness/navigation/collision";
import {
  isGroundError,
  type NativeMap,
  validateNativePoint,
} from "#harness/navigation/native";
import { CORNER_RISE } from "#harness/navigation/swim";

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
      checkCollision(map, from, native, CORNER_RISE);
    } catch (stepError) {
      if (isGroundError(stepError)) throw error;
      throw stepError;
    }
    return native;
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
