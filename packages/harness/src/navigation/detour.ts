import { type NavPoint, WALKABLE_CLIMB } from "@peon/core";
import { columnHeights, groundFloors } from "#harness/navigation/column";
import { isGroundError, type NativeMap } from "#harness/navigation/native";

type Spot = { x: number; y: number };
type Leg = { points: readonly NavPoint[]; length: number };
export type LegPlanner = (from: NavPoint, to: NavPoint) => Leg | undefined;

const RADII = [8, 16, 32] as const;
const BEARINGS = 8;

export function refusalAt(error: unknown): Spot | undefined {
  if (!(error instanceof Error && "at" in error)) return undefined;
  const { at } = error;
  if (typeof at !== "object" || at === null) return undefined;
  if (!("x" in at && "y" in at)) return undefined;
  return typeof at.x === "number" && typeof at.y === "number"
    ? { x: at.x, y: at.y }
    : undefined;
}

export function refusedAt<E extends Error>(error: E, at: Spot): E {
  return Object.assign(error, { at: { x: at.x, y: at.y } });
}

type Detour = {
  map: NativeMap;
  from: NavPoint;
  to: NavPoint;
  refusal: unknown;
  plan: LegPlanner;
};

export function detourPoints({
  map,
  from,
  to,
  refusal,
  plan,
}: Detour): NavPoint[] | undefined {
  const around = refusalAt(refusal);
  if (around === undefined) return undefined;
  for (const radius of RADII) {
    let best: { points: NavPoint[]; length: number } | undefined;
    for (const waypoint of ring(map, from, around, radius)) {
      const through = join(from, waypoint, to, plan);
      if (through && (best === undefined || through.length < best.length))
        best = through;
    }
    if (best) return best.points;
  }
  return undefined;
}

function join(
  from: NavPoint,
  waypoint: NavPoint,
  to: NavPoint,
  plan: LegPlanner,
): { points: NavPoint[]; length: number } | undefined {
  const first = plan(from, waypoint);
  const middle = first?.points.at(-1);
  if (first === undefined || middle === undefined) return undefined;
  const second = plan(middle, to);
  if (second === undefined) return undefined;
  return {
    length: first.length + second.length,
    points: [...first.points, ...second.points.slice(1)],
  };
}

function ring(
  map: NativeMap,
  from: NavPoint,
  around: Spot,
  radius: number,
): NavPoint[] {
  const waypoints: NavPoint[] = [];
  for (let i = 0; i < BEARINGS; i++) {
    const angle = (i / BEARINGS) * Math.PI * 2;
    const x = around.x + Math.cos(angle) * radius;
    const y = around.y + Math.sin(angle) * radius;
    const z = levelFloor(map, from, { x, y });
    if (z !== undefined) waypoints.push({ x, y, z });
  }
  return waypoints;
}

function levelFloor(
  map: NativeMap,
  from: NavPoint,
  { x, y }: Spot,
): number | undefined {
  try {
    map.loadAdtAt(x, y);
    const level = groundFloors(columnHeights(map, x, y)).filter(
      (floor) => Math.abs(floor - from.z) <= WALKABLE_CLIMB,
    );
    return level.length === 1 ? level[0] : undefined;
  } catch (error) {
    if (!isGroundError(error)) throw error;
    return undefined;
  }
}
