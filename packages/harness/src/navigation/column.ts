import { GROUND_ERROR, MESH_HEIGHT, WALKABLE_CLIMB } from "@peon/core";
import { START_SNAP } from "#harness/navigation/collision";
import { groundError, type NativeMap } from "#harness/navigation/native";

type Point = { x: number; y: number; z: number };

export function settleStart<P extends Point>(
  map: NativeMap,
  from: P,
  stale = false,
): P {
  const heights = columnHeights(map, from.x, from.y);
  if (heights.some((height) => Math.abs(height - from.z) <= GROUND_ERROR))
    return from;
  const floors = groundFloors(heights);
  if (floors.length !== 1 && !stale) return from;
  const floor = floors.find((height) => {
    const rise = from.z - height;
    return rise > GROUND_ERROR && rise <= START_SNAP;
  });
  return floor === undefined ? from : { ...from, z: floor };
}

export function groundFloors(heights: readonly number[]): number[] {
  const floors: number[] = [];
  for (const height of heights)
    if (
      clearAbove(heights, height) &&
      !floors.some((floor) => Math.abs(floor - height) <= GROUND_ERROR)
    )
      floors.push(height);
  return floors.sort((a, b) => b - a);
}

export function continuousFloor(
  heights: readonly number[],
  traced: number,
  fromZ: number,
): number {
  const floors = groundFloors(heights);
  if (floors.length < 2) return traced;
  if (Math.abs(traced - fromZ) <= WALKABLE_CLIMB && clearAbove(heights, traced))
    return traced;
  const near = floors.filter(
    (floor) => Math.abs(floor - fromZ) <= WALKABLE_CLIMB,
  );
  const [only] = near;
  return near.length === 1 && only !== undefined ? only : traced;
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
