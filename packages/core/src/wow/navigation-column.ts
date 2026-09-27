import {
  GROUND_ERROR,
  MESH_HEIGHT,
  START_SNAP,
} from "#wow/navigation-collision";
import { groundError, type NativeMap } from "#wow/navigation-native";

export const FLOOR_MERGE = 0.01;

type Point = { x: number; y: number; z: number };

export function settleStart<P extends Point>(map: NativeMap, from: P): P {
  const heights = columnHeights(map, from.x, from.y);
  if (heights.some((height) => Math.abs(height - from.z) <= GROUND_ERROR))
    return from;
  const floors = groundFloors(heights);
  const floor = floors[0];
  if (floors.length !== 1 || floor === undefined) return from;
  const rise = from.z - floor;
  return rise > GROUND_ERROR && rise <= START_SNAP
    ? { ...from, z: floor }
    : from;
}

export function groundFloors(heights: readonly number[]): number[] {
  const floors: number[] = [];
  for (const height of heights)
    if (
      clearAbove(heights, height) &&
      !floors.some((floor) => Math.abs(floor - height) <= FLOOR_MERGE)
    )
      floors.push(height);
  return floors.sort((a, b) => b - a);
}

export function clearAbove(heights: readonly number[], z: number): boolean {
  return !heights.some(
    (height) => height - z > GROUND_ERROR && height - z <= MESH_HEIGHT,
  );
}

export function floorError(message: string, heights: readonly number[]): Error {
  const floors = groundFloors(heights);
  const listed = floors.map((floor) => floor.toFixed(2)).join(", ");
  return Object.assign(groundError(`${message} (floors ${listed})`), {
    floors,
  });
}

export function columnHeights(map: NativeMap, x: number, y: number): number[] {
  const heights = map.findHeights(x, y);
  if (heights.length === 0 || !heights.every(Number.isFinite))
    throw groundError("ground height unavailable");
  return heights;
}
