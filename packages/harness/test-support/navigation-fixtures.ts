import type { NavPoint } from "@peon/core";
import { setup } from "@peon/core/test-support/control-fixtures";
import type { ControlRuntime } from "@peon/core/test-support/internals";
import {
  type GotoTarget,
  routeTo,
  type TravelDeps,
  type WalkTarget,
  walkTowardTarget,
} from "#harness/navigation/goto";
import type { NativeMap } from "#harness/navigation/native";
import { createNavigation } from "#harness/navigation/planner";
import {
  RouteFollower,
  type RouteHandle,
} from "#harness/navigation/route-follower";
import { nudgeOntoMesh } from "#harness/navigation/travel";

export function native(over: Partial<NativeMap> = {}): NativeMap {
  return {
    close: () => {},
    findHeight: () => 0,
    findHeights: () => [0],
    findLiquid: () => undefined,
    findPath: (from, to) => [{ ...from }, { ...to }],
    lineOfSight: () => true,
    loadAdtAt: () => {},
    ...over,
  };
}

export function navigation(map: NativeMap) {
  return createNavigation(() => map);
}

export function routeHandle(control: ControlRuntime): RouteHandle {
  return {
    follow: (guide, facing, durationMs) =>
      control.follow(guide, facing, durationMs),
    getControlState: () => control.snapshot(),
    onEntityEvent: () => () => {},
    onMovementStop: (cb) => control.onStop(cb),
    setSwimming: (on: boolean) => control.setSwimming(on),
    stopMoving: (reason) => control.halt(reason),
  };
}

export function routedControl(control: ControlRuntime, now: () => number) {
  const routes = new RouteFollower({ handle: routeHandle(control), now });
  const port = Object.assign(control, {
    navigationState: () => routes.state(),
  });
  return { control: port, routes };
}

export function routeSetup(over: Parameters<typeof setup>[0] = {}) {
  let now = 10_000;
  const f = setup({ now: () => now, ticks: () => now - 10_000, ...over });
  const routes = new RouteFollower({
    handle: routeHandle(f.runtime),
    now: () => now,
  });
  const runtime = Object.assign(f.runtime, {
    navigate: (...args: Parameters<RouteFollower["navigate"]>) =>
      routes.navigate(...args),
    navigationError: (...args: Parameters<RouteFollower["refuse"]>) =>
      routes.refuse(...args),
    navigationState: () => routes.state(),
    observeDisappear: (guid: bigint) => routes.observeDisappear(guid),
  });
  const advance = (ms: number) => {
    now += ms;
    f.advance(ms);
  };
  return { ...f, advance, now: () => now, routes, runtime };
}

export function travelFixture(
  map: NativeMap,
  targets = new Map<bigint, NavPoint>(),
) {
  const f = routeSetup();
  const planner = createNavigation(() => map);
  const observedPosition = (guid: bigint): NavPoint => {
    const target = targets.get(guid);
    if (!target) throw new Error("target_not_observed");
    return target;
  };
  const deps: TravelDeps = {
    handle: {
      getControlState: () => f.runtime.snapshot(),
      observedPosition,
      walkTowardPoint: (point, yards, signal) =>
        f.runtime.walkToward(point, yards, signal),
    },
    navigation: () => planner,
    now: f.now,
    routes: f.routes,
  };
  const handle = {
    goTo: (target: GotoTarget) => routeTo(deps, target),
    nudge: (_target: WalkTarget, yards: number, signal?: AbortSignal) =>
      nudgeOntoMesh(deps, yards, signal),
    observedPosition,
    walkToward: (target: WalkTarget, yards: number, signal?: AbortSignal) =>
      walkTowardTarget(deps, target, yards, signal),
  };
  return { ...f, deps, handle, navigation: planner };
}
