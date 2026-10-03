import {
  CELL_HEIGHT,
  distance2d,
  GROUND_ERROR,
  WALKABLE_SLOPE,
  withinStep,
} from "@peon/core";
import {
  clearAbove,
  columnHeights,
  groundFloors,
} from "#harness/navigation/column";
import { groundError, type NativeMap } from "#harness/navigation/native";

type Point = { x: number; y: number; z: number };

export function connectedHeight(
  map: NativeMap,
  x: number,
  y: number,
  from: Point,
): number {
  const h = probeHeight(map, x, y, from);
  if (Number.isFinite(h)) return h;
  return continuousHeight(map, x, y, from.z) ?? uniqueHeight(map, x, y);
}

export function stepHeight(
  map: NativeMap,
  x: number,
  y: number,
  from: Point,
): number {
  const reachable = reachableHeight(map, x, y, from);
  if (reachable !== undefined) return reachable;
  const h = probeHeight(map, x, y, from);
  if (Number.isFinite(h)) return h;
  return uniqueHeight(map, x, y);
}

export function probeHeight(
  map: NativeMap,
  x: number,
  y: number,
  from: Point,
): number {
  try {
    return map.findHeight(from, x, y);
  } catch {
    return Number.NaN;
  }
}

export function uniqueHeight(map: NativeMap, x: number, y: number): number {
  const first = groundHeights(map, x, y)[0];
  if (first === undefined) throw groundError("ground height unavailable");
  return first;
}

export function continuousHeight(
  map: NativeMap,
  x: number,
  y: number,
  referenceZ: number,
): number | undefined {
  const matches = map
    .findHeights(x, y)
    .filter(
      (height) =>
        Number.isFinite(height) &&
        Math.abs(height - referenceZ) <= GROUND_ERROR,
    );
  return matches.length === 1 ? matches[0] : undefined;
}

export function reachableHeight(
  map: NativeMap,
  x: number,
  y: number,
  from: Point,
): number | undefined {
  let best: number | undefined;
  for (const z of map.findHeights(x, y)) {
    if (!withinStep(from, { x, y, z })) continue;
    if (best === undefined || z > best) best = z;
  }
  return best;
}

export function groundHeights(map: NativeMap, x: number, y: number): number[] {
  const heights = columnHeights(map, x, y);
  const first = heights[0];
  if (first === undefined) throw groundError("ground height unavailable");
  if (groundFloors(heights).length > 1)
    throw groundError("ambiguous ground column");
  return heights;
}

export function traceHeight(
  map: NativeMap,
  from: Point,
  to: { x: number; y: number },
  columnFallback: boolean,
): number {
  try {
    return map.findHeight(from, to.x, to.y);
  } catch (error) {
    const floor = columnFallback ? slopeFloor(map, from, to) : undefined;
    if (floor === undefined) throw error;
    return floor;
  }
}

export function slopeFloor(
  map: NativeMap,
  from: Point,
  { x, y }: { x: number; y: number },
): number | undefined {
  const column = map.findHeights(x, y);
  const floors = groundFloors(
    column.filter((z) => Number.isFinite(z) && withinSlope(from, { x, y, z })),
  );
  const standable = floors.filter((floor) => clearAbove(column, floor));
  if (standable.length === 0) return undefined;
  const [first, ...rest] = [...standable].sort(
    (a, b) => Math.abs(a - from.z) - Math.abs(b - from.z),
  );
  if (first === undefined) return undefined;
  return rest.every((floor) => Math.abs(floor - first) <= GROUND_ERROR)
    ? first
    : undefined;
}

export function withinSlope(from: Point, to: Point): boolean {
  const reach = CELL_HEIGHT + distance2d(from, to) * WALKABLE_SLOPE;
  return Math.abs(to.z - from.z) <= reach;
}
