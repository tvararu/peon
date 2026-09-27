import { expect, jest, test } from "bun:test";
import type { NavPoint, WorldHandle } from "@peon/core";
import type { ControlRuntime } from "@peon/core/test-support/internals";
import { must } from "@peon/core/test-support/must";
import { groundError } from "#harness/navigation/native";
import { groundOracle } from "#harness/navigation/oracle";
import { createNavigation, GroundRoute } from "#harness/navigation/planner";
import { createTravel } from "#harness/navigation/travel";
import {
  native,
  routeHandle,
  routeSetup,
} from "#test-support/navigation-fixtures";

const UNKNOWN = "pathfind_find_height failed (UNKNOWN_HEIGHT)";
const FLOOR = 70.34;

function watchedMap() {
  const seen = { closed: false, queriedClosed: false };
  const floor = (): number[] => {
    if (seen.closed) seen.queriedClosed = true;
    return [FLOOR];
  };
  const map = native({
    close: () => {
      seen.closed = true;
    },
    findHeight: () => floor()[0] ?? Number.NaN,
    findHeights: floor,
  });
  const navigation = createNavigation(() => map);
  const session = {
    ground: groundOracle(navigation),
    navigation,
    source: { covers: () => true, open: () => map },
  };
  return { seen, session };
}

function sessionHandle(runtime: ControlRuntime) {
  const closed = Promise.withResolvers<void>();
  const handle = {
    ...routeHandle(runtime),
    closed: closed.promise,
  } as unknown as WorldHandle;
  return { close: closed.resolve, handle };
}

test("retiring travel mid-route keeps the map open through core shutdown and never replans", async () => {
  jest.useFakeTimers();
  try {
    const { seen, session } = watchedMap();
    const f = routeSetup();
    const start = must(f.runtime.snapshot().pose);
    const { close, handle } = sessionHandle(f.runtime);
    const travel = createTravel(handle, session);
    travel.goTo({ kind: "point", x: start.x + 20, y: start.y });
    f.advance(300);
    expect(travel.getNavigationState().active).toBe(true);

    travel.dispose();
    f.advance(50);
    f.runtime.halt("close");
    f.runtime.dispose();
    close();
    await Promise.resolve();
    f.advance(10_000);

    expect(seen).toEqual({ closed: true, queriedClosed: false });
    expect(f.runtime.snapshot().moving).toBe(false);
    expect(travel.getNavigationState()).toMatchObject({
      active: false,
      blockedReason: "close",
    });
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test("retiring the follower during a pending replan settles it so awaiters finish", () => {
  jest.useFakeTimers();
  try {
    const f = routeSetup();
    const start = must(f.runtime.snapshot().pose);
    const destination = { x: start.x + 20, y: start.y, z: start.z };
    const map = native({
      findHeight: (_from, x) => {
        const along = x - start.x;
        if (along > 3.05 && along < 3.2) throw groundError(UNKNOWN);
        return start.z;
      },
      findHeights: () => [start.z],
    });
    const route = (from: NavPoint) => new GroundRoute([from, destination], map);
    const replan = jest.fn((from: NavPoint) => route(from));
    const origin = { x: start.x, y: start.y, z: start.z };
    f.routes.navigate(route(origin), destination, replan);
    f.advance(300);
    f.advance(140);
    expect(f.routes.state().replan?.pending).toBe(true);

    f.routes.dispose();
    f.advance(10_000);

    expect(replan).not.toHaveBeenCalled();
    expect(f.routes.state()).toMatchObject({
      active: false,
      blockedReason: "close",
      replan: { pending: false },
    });
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test("retiring travel during a raw move keeps the map open for core's shutdown halt", async () => {
  jest.useFakeTimers();
  try {
    const { seen, session } = watchedMap();
    const f = routeSetup({ ground: session.ground });
    const { close, handle } = sessionHandle(f.runtime);
    const travel = createTravel(handle, session);
    f.runtime.move("forward", 2000);
    f.advance(300);

    travel.dispose();
    f.advance(50);
    f.runtime.halt("close");
    const halted = f.runtime.snapshot();
    const stopped = must(halted.pose);
    f.runtime.dispose();
    close();
    await Promise.resolve();

    expect(seen).toEqual({ closed: true, queriedClosed: false });
    expect(stopped.x).toBeGreaterThan(8709.46 + 2);
    expect(halted).toMatchObject({ blockedReason: undefined, moving: false });
    expect(f.events.some((event) => event.type === "control_error")).toBe(
      false,
    );
  } finally {
    jest.useRealTimers();
  }
});
