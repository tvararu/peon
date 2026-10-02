import { GROUND_ERROR, type NavPoint } from "@peon/core";
import {
  clearAbove,
  columnHeights,
  floorError,
  groundFloors,
  nearestFloorZ,
} from "#harness/navigation/column";
import {
  groundError,
  type NativeMap,
  validateNativePoint,
} from "#harness/navigation/native";

export function snapDestination(map: NativeMap, point: NavPoint): NavPoint {
  validateNativePoint(point);
  const heights = columnHeights(map, point.x, point.y);
  const hit = nearestFloorZ(heights, point.z);
  if (hit === undefined) {
    checkDestination(map, point);
    return point;
  }
  return { ...point, z: hit.snapped };
}

export function checkDestination(map: NativeMap, point: NavPoint): void {
  validateNativePoint(point);
  const heights = columnHeights(map, point.x, point.y);
  const onSurface = heights.some(
    (height) => Math.abs(height - point.z) <= GROUND_ERROR,
  );
  if (onSurface && clearAbove(heights, point.z)) return;
  throw floorError("destination is not on a ground floor", heights);
}

export function destinationFloor(map: NativeMap, x: number, y: number): number {
  const heights = columnHeights(map, x, y);
  const floors = groundFloors(heights);
  const floor = floors[0];
  if (floor === undefined) throw groundError("ground height unavailable");
  if (floors.length > 1)
    throw floorError("ambiguous ground column at destination", heights);
  return floor;
}
