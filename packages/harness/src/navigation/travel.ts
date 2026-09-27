import type { GroundOracle, WalkOutcome, WorldHandle } from "@peon/core";
import {
  type GotoTarget,
  routeTo,
  type WalkTarget,
  walkTowardTarget,
} from "#harness/navigation/goto";
import type { NavigationSource } from "#harness/navigation/native";
import {
  type NavigationObservation,
  observeNavigation,
} from "#harness/navigation/observation";
import { groundOracle } from "#harness/navigation/oracle";
import { createNavigation, type Navigation } from "#harness/navigation/planner";
import {
  type NavigationState,
  RouteFollower,
} from "#harness/navigation/route-follower";

export type Travel = {
  goTo: (target: GotoTarget) => void;
  getNavigationState: () => NavigationState;
  observeNavigation: () => NavigationObservation;
  walkToward: (
    target: WalkTarget,
    yards: number,
    signal?: AbortSignal,
  ) => Promise<WalkOutcome>;
};

export type TravelSession = Travel & {
  dispose: () => void;
  close: () => void;
};

export type SessionNavigation = {
  source: NavigationSource;
  navigation: Navigation;
  ground: GroundOracle;
};

export function sessionNavigation(
  source: NavigationSource | undefined,
): SessionNavigation | undefined {
  if (!source) return undefined;
  const navigation = createNavigation(source.open);
  return { ground: groundOracle(navigation), navigation, source };
}

export function navigationCovers(
  session: SessionNavigation | undefined,
  mapId: number | undefined,
): boolean {
  if (!session) return false;
  return mapId === undefined || session.source.covers(mapId);
}

export function createTravel(
  handle: WorldHandle,
  session: SessionNavigation | undefined,
): TravelSession {
  const now = () => Date.now();
  const routes = new RouteFollower({ handle, now });
  const navigation = () => {
    if (!session) throw new Error("missing_navigation");
    return session.navigation;
  };
  const deps = { handle, navigation, now, routes };
  let retired = false;
  const open = () => {
    if (retired) throw new Error("session_closed");
  };
  return {
    close: () => session?.navigation.close(),
    dispose() {
      retired = true;
      routes.dispose();
    },
    getNavigationState: () => routes.state(),
    goTo(target) {
      open();
      routeTo(deps, target);
    },
    observeNavigation: () => observeNavigation(routes.state()),
    async walkToward(target, yards, signal) {
      open();
      return await walkTowardTarget(deps, target, yards, signal);
    },
  };
}
