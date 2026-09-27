import { describe, expect, jest, test } from "bun:test";
import { setup } from "#test-support/control-fixtures";
import { must } from "#test-support/must";
import { controlMethods } from "#wow/client-control";
import { createNavigation, type NavPoint } from "#wow/navigation";
import type { Runtimes } from "#wow/runtime";
import type { WorldConn } from "#wow/world-conn";

const FLOOR = 70.34;

function walked() {
  const control = setup();
  let columns = (_x: number, _y: number) => [FLOOR];
  const navigation = createNavigation(() => ({
    loadAdtAt() {},
    findHeights: (x, y) => columns(x, y),
    findHeight: (from, x, y) =>
      columns(x, y).find((z) => Math.abs(z - from.z) <= 2) ?? Number.NaN,
    lineOfSight: () => true,
    findPath: (from: NavPoint, to: NavPoint) => [from, to],
    close() {},
  }));
  const rt = {
    control: control.runtime,
    navigation: () => navigation,
    observedTarget: () => {
      throw new Error("target_not_observed");
    },
    steer: (reason?: string) => control.runtime.halt(reason),
  } as unknown as Runtimes;
  const handle = controlMethods({} as WorldConn, rt);
  const start = must(control.runtime.snapshot().pose);
  handle.goTo({ kind: "point", x: start.x + 5, y: start.y });
  control.advance(3000);
  return {
    ...control,
    handle,
    lower(atX: number, column: number[]) {
      columns = (x) => (Math.abs(x - atX) < 1 ? column : [FLOOR - 0.6]);
    },
  };
}

describe("goTo from a stale predicted pose", () => {
  test("settles onto the floor under a predicted pose with an old server fix", () => {
    jest.useFakeTimers();
    try {
      const f = walked();
      const pose = must(f.runtime.snapshot().pose);
      expect(pose.source).toBe("predicted");
      f.advance(11_000);
      f.lower(pose.x, [FLOOR - 0.6, FLOOR - 10]);
      f.handle.goTo({ kind: "point", x: pose.x + 5, y: pose.y });
      expect(f.runtime.navigationState()).toMatchObject({
        active: true,
        refusal: undefined,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test("keeps waiting for the server when the fix is recent", () => {
    jest.useFakeTimers();
    try {
      const f = walked();
      const pose = must(f.runtime.snapshot().pose);
      f.lower(pose.x, [FLOOR - 0.6, FLOOR - 10]);
      expect(() =>
        f.handle.goTo({ kind: "point", x: pose.x + 5, y: pose.y }),
      ).toThrow("wait: position disagrees with ground height");
    } finally {
      jest.useRealTimers();
    }
  });
});
