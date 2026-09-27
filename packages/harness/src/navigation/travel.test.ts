import { expect, jest, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import { must } from "@peon/core/test-support/must";
import { groundOracle } from "#harness/navigation/oracle";
import { createNavigation } from "#harness/navigation/planner";
import { createTravel } from "#harness/navigation/travel";
import {
  native,
  routeHandle,
  routeSetup,
} from "#test-support/navigation-fixtures";

test("disposing travel mid-route stops the mover before the map closes and never replans", () => {
  jest.useFakeTimers();
  try {
    const f = routeSetup();
    const start = must(f.runtime.snapshot().pose);
    let closed = false;
    let queriedClosed = false;
    const floor = (): number[] => {
      if (closed) queriedClosed = true;
      return [start.z];
    };
    const map = native({
      close: () => {
        closed = true;
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
    const handle = routeHandle(f.runtime) as unknown as WorldHandle;
    const travel = createTravel(handle, session);
    travel.goTo({ kind: "point", x: start.x + 20, y: start.y });
    f.advance(300);
    expect(travel.getNavigationState().active).toBe(true);

    travel.dispose();
    f.advance(50);
    f.runtime.halt("close");
    f.advance(10_000);

    expect(closed).toBe(true);
    expect(queriedClosed).toBe(false);
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
