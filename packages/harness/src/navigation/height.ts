import {
  CELL_HEIGHT,
  distance2d,
  GROUND_ERROR,
  WALKABLE_SLOPE,
  withinStep,
} from "@peon/core";
import {
  columnHeights,
  FLOOR_MERGE,
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
  if (heights.some((height) => Math.abs(height - first) > FLOOR_MERGE))
    throw groundError("ambiguous ground column");
  return heights;
}

export function traceHeight(
  map: NativeMap,
  from: Point,
  to: { x: number; y: number },
  columnFallback: boolean,
): { floor: number; inside: boolean } {
  try {
    return { floor: map.findHeight(from, to.x, to.y), inside: false };
  } catch (error) {
    const floor = columnFallback ? slopeFloor(map, from, to) : undefined;
    if (floor !== undefined) return { floor, inside: true };
    const drop = columnFallback ? dropFloor(map, from, to) : undefined;
    if (drop === undefined) throw error;
    return drop;
  }
}

export function slopeFloor(
  map: NativeMap,
  from: Point,
  { x, y }: { x: number; y: number },
): number | undefined {
  const near = map
    .findHeights(x, y)
    .filter((z) => Number.isFinite(z) && withinSlope(from, { x, y, z }));
  const first = near[0];
  if (first === undefined) return undefined;
  return near.every((z) => Math.abs(z - first) <= FLOOR_MERGE)
    ? first
    : undefined;
}

export function dropFloor(
  map: NativeMap,
  from: Point,
  { x, y }: { x: number; y: number },
): { floor: number; inside: boolean } | undefined {
  const source = map
    .findHeights(from.x, from.y)
    .filter((z) => Number.isFinite(z));
  const floors = groundFloors(source);
  const ahead = map
    .findHeights(x, y)
    .filter((z) => Number.isFinite(z) && withinStep(from, { x, y, z }))
    .sort((a, b) => Math.abs(a - from.z) - Math.abs(b - from.z));
  const merged = mergeFloors(ahead);
  const [first, ...rest] = merged;
  if (first === undefined) return undefined;
  const [next] = rest;
  if (
    next !== undefined &&
    Math.abs(next - from.z) - Math.abs(first - from.z) <= GROUND_ERROR
  )
    return undefined;
  if (floors.length < 2) return { floor: first, inside: true };
  return {
    floor: first,
    inside: floors.includes(first) || sameFloor(floors, first),
  };
}

export function steppedHeight(
  map: NativeMap,
  point: Point,
  from: Point,
): { floor: number; inside: boolean } {
  try {
    const traced = traceHeight(map, point, from, true);
    if (traced.floor - from.z <= GROUND_ERROR) return traced;
    try {
      return dropFloor(map, point, from) ?? traced;
    } catch {
      return traced;
    }
  } catch {
    return { floor: from.z, inside: true };
  }
}

function mergeFloors(heights: readonly number[]): number[] {
  const merged: number[] = [];
  for (const height of heights)
    if (merged.every((floor) => Math.abs(floor - height) > GROUND_ERROR))
      merged.push(height);
  return merged;
}

function sameFloor(floors: readonly number[], z: number): boolean {
  return floors.some((floor) => Math.abs(floor - z) <= FLOOR_MERGE);
}

export function withinSlope(from: Point, to: Point): boolean {
  const reach = CELL_HEIGHT + distance2d(from, to) * WALKABLE_SLOPE;
  return Math.abs(to.z - from.z) <= reach;
}
