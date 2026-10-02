import { describe, expect, jest, test } from "bun:test";
import type { NavPoint } from "@peon/core";
import { must } from "@peon/core/test-support/must";
import { travelFixture } from "#test-support/navigation-fixtures";

const FLOOR = 70.34;

function walked() {
  let columns = (_x: number, _y: number) => [FLOOR];
  const f = travelFixture({
    close() {},
    findHeight: (from, x, y) =>
      columns(x, y).find((z) => Math.abs(z - from.z) <= 2) ?? Number.NaN,
    findHeights: (x, y) => columns(x, y),
    findLiquid: () => undefined,
    findPath: (from: NavPoint, to: NavPoint) => [from, to],
    lineOfSight: () => true,
    loadAdtAt() {},
  });
  const start = must(f.runtime.snapshot().pose);
  f.handle.goTo({ kind: "point", x: start.x + 5, y: start.y });
  f.advance(3000);
  return {
    ...f,
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
