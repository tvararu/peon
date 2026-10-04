import { GROUND_ERROR, type NavPoint } from "@peon/core";
import {
  clearAbove,
  columnHeights,
  floorError,
  groundFloors,
} from "#harness/navigation/column";
import {
  groundError,
  type NativeMap,
  validateNativePoint,
} from "#harness/navigation/native";
import { surfaceAt } from "#harness/navigation/swim";

export function checkDestination(map: NativeMap, point: NavPoint): void {
  validateNativePoint(point);
  const surface = surfaceAt(map, point, point.z);
  if (surface !== undefined && Math.abs(surface - point.z) <= GROUND_ERROR)
    return;
  const heights = columnHeights(map, point.x, point.y);
  const onSurface = heights.some(
    (height) => Math.abs(height - point.z) <= GROUND_ERROR,
  );
  if (onSurface && clearAbove(heights, point.z)) return;
  throw floorError("destination is not on a ground floor", heights);
}

export function destinationFloor(map: NativeMap, x: number, y: number): number {
  const heights = columnHeights(map, x, y);
  const [low] = [...heights].sort((a, b) => a - b);
  const surface = surfaceAt(map, { x, y }, low ?? 0);
  if (surface !== undefined) return surface;
  const floors = groundFloors(heights);
  const floor = floors[0];
  if (floor === undefined) throw groundError("ground height unavailable");
  if (floors.length > 1)
    throw floorError("ambiguous ground column at destination", heights);
  return floor;
}

export function routableFloor<Route>(
  floors: readonly number[],
  plan: (z: number) => Route,
): Route {
  const routes: Route[] = [];
  const routed: number[] = [];
  const refusals: Error[] = [];
  for (const z of floors) {
    try {
      routes.push(plan(z));
      routed.push(z);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      refusals.push(error);
    }
  }
  const [only] = routes;
  if (routes.length === 1 && only !== undefined) return only;
  if (routes.length > 1)
    throw floorError("ambiguous ground column at destination", routed);
  const specific = refusals.find(
    (error) => !error.message.includes("snapped off"),
  );
  const refusal = specific ?? refusals[0];
  if (refusal === undefined) throw groundError("ground height unavailable");
  throw refusal;
}
