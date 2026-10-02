import {
  type ControlPose,
  GROUND_ERROR,
  type NavPoint,
  type WalkOutcome,
  type WorldHandle,
} from "@peon/core";
import {
  classifyNavigationRefusal,
  type GroundRoute,
  type NavDestination,
  type Navigation,
  type PlanStart,
  refusalFloors,
} from "#harness/navigation/planner";
import type { RouteFollower } from "#harness/navigation/route-follower";

export type WalkTarget =
  | { kind: "guid"; guid: bigint }
  | { kind: "point"; x: number; y: number; z: number };
export type GotoTarget =
  | { kind: "guid"; guid: bigint }
  | { kind: "point"; x: number; y: number; z?: number };

export type TravelDeps = {
  handle: Pick<
    WorldHandle,
    "getControlState" | "observedPosition" | "walkTowardPoint"
  >;
  navigation: () => Navigation;
  routes: RouteFollower;
  now: () => number;
};

type Planned = { route: GroundRoute; resolved: NavPoint };

const STALE_FIX_MS = 10_000;

function groundedPoint(
  navigation: Navigation,
  target: NavPoint,
  pose: ControlPose,
): NavPoint {
  if (![target.x, target.y, target.z].every(Number.isFinite))
    throw new Error("invalid_destination");
  let z: number;
  try {
    z = navigation.height(pose.mapId, target.x, target.y);
  } catch {
    z = navigation.height(pose.mapId, target.x, target.y, pose);
  }
  if (Math.abs(z - target.z) > GROUND_ERROR)
    throw new Error("destination_not_grounded");
  return { x: target.x, y: target.y, z };
}

function resolveWalkDestination(
  deps: TravelDeps,
  target: WalkTarget,
  pose: ControlPose,
): NavPoint {
  const navigation = deps.navigation();
  const destination =
    target.kind === "guid"
      ? deps.handle.observedPosition(target.guid)
      : groundedPoint(navigation, target, pose);
  const ground = navigation.height(pose.mapId, pose.x, pose.y, pose);
  if (Math.abs(ground - pose.z) > GROUND_ERROR)
    throw new Error("self_not_grounded");
  return destination;
}

export async function walkTowardTarget(
  deps: TravelDeps,
  target: WalkTarget,
  yards: number,
  signal?: AbortSignal,
): Promise<WalkOutcome> {
  if (!Number.isFinite(yards) || yards <= 0 || yards > 20)
    throw new Error("invalid_distance");
  const pose = deps.handle.getControlState().pose;
  if (!pose) throw new Error("no_pose");
  if (signal?.aborted)
    return { pose, reason: "abort", status: "stopped", traveled: 0 };
  let destination: NavPoint;
  try {
    destination = resolveWalkDestination(deps, target, pose);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "target_unavailable";
    return { pose, reason, status: "stopped", traveled: 0 };
  }
  return await deps.handle.walkTowardPoint(destination, yards, signal);
}

function planStart(pose: ControlPose, fixAge: number | undefined): PlanStart {
  const stale =
    pose.source === "predicted" &&
    (fixAge ?? Number.POSITIVE_INFINITY) > STALE_FIX_MS;
  return { stale };
}

function planDestination(
  navigation: Navigation,
  pose: ControlPose,
  destination: NavDestination,
  start: PlanStart = {},
): Planned {
  const { x, y, z } = destination;
  if (z !== undefined) {
    const route = navigation.plan(pose.mapId, pose, { x, y, z }, start);
    return { resolved: { x, y, z: route.points.at(-1)?.z ?? z }, route };
  }
  const route = navigation.planGround(pose.mapId, pose, { x, y }, start);
  const end = route.points.at(-1);
  if (end === undefined) throw new Error("navigation_route_empty");
  return { resolved: { x, y, z: end.z }, route };
}

function planUnitFloor(
  navigation: Navigation,
  { pose, start }: { pose: ControlPose; start: PlanStart },
  destination: NavDestination,
  unitZ: number,
): Planned {
  try {
    return planDestination(navigation, pose, destination, start);
  } catch (error) {
    const near = (refusalFloors(error) ?? []).filter(
      (height) => Math.abs(height - unitZ) <= GROUND_ERROR,
    );
    const [picked] = near;
    if (near.length !== 1 || picked === undefined) throw error;
    return planDestination(
      navigation,
      pose,
      { ...destination, z: picked },
      start,
    );
  }
}

function pointOf(target: GotoTarget): NavDestination | undefined {
  if (target.kind === "guid") return undefined;
  const { x, y, z } = target;
  if (![x, y, z ?? 0].every(Number.isFinite))
    throw new Error("stop: invalid_destination");
  return z === undefined ? { x, y } : { x, y, z };
}

export function routeTo(deps: TravelDeps, target: GotoTarget): void {
  let destination = pointOf(target);
  const state = deps.handle.getControlState();
  const { pose, serverPose } = state;
  if (!pose) throw new Error("stop: no_pose");
  const fixAge = serverPose && deps.now() - serverPose.updatedAt;
  const start = planStart(pose, fixAge);
  const navigation = deps.navigation();
  const guid = target.kind === "guid" ? target.guid : undefined;
  try {
    let unitZ: number | undefined;
    if (guid !== undefined) {
      const { x, y, z } = deps.handle.observedPosition(guid);
      destination = { x, y };
      unitZ = z;
    }
    if (destination === undefined) throw new Error("invalid_destination");
    const { route, resolved } =
      unitZ === undefined
        ? planDestination(navigation, pose, destination, start)
        : planUnitFloor(navigation, { pose, start }, destination, unitZ);
    deps.routes.navigate(
      route,
      resolved,
      (origin) => navigation.plan(pose.mapId, origin, resolved),
      guid,
    );
  } catch (error) {
    const raw = error instanceof Error ? error.message : "navigation_failed";
    const refusal = classifyNavigationRefusal(raw);
    deps.routes.refuse(destination, raw, {
      floors: refusalFloors(error),
      refusal,
      target: guid,
    });
    throw new Error(`${refusal}: ${raw}`, { cause: error });
  }
}
