import { distance2d, GROUND_ERROR, type NavPoint } from "@peon/core";
import { clearAbove, columnHeights } from "#harness/navigation/column";
import {
  groundError,
  type NativeMap,
  validateNativePoint,
} from "#harness/navigation/native";
import { surfaceAt } from "#harness/navigation/swim";

const ADT_STEP = 64;

export function loadCorridor(
  map: NativeMap,
  from: NavPoint,
  to: NavPoint,
): void {
  const steps = Math.max(1, Math.ceil(distance2d(from, to) / ADT_STEP));
  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps;
    map.loadAdtAt(
      from.x + (to.x - from.x) * ratio,
      from.y + (to.y - from.y) * ratio,
    );
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

export function checkStart(map: NativeMap, point: NavPoint): number[] {
  validateNativePoint(point);
  const surface = surfaceAt(map, point, point.z);
  if (surface !== undefined && Math.abs(surface - point.z) <= GROUND_ERROR)
    return [surface];
  const heights = columnHeights(map, point.x, point.y);
  if (heights.every((height) => Math.abs(height - point.z) > GROUND_ERROR))
    throw groundError("position disagrees with ground height");
  if (!clearAbove(heights, point.z))
    throw groundError("ambiguous ground column at start");
  return heights;
}
