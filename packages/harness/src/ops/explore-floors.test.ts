import { describe, expect, test } from "bun:test";
import { explore } from "#harness/ops/explore";
import {
  driveGoto,
  MAP_ID,
  setSelf,
  toolCtx,
} from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

describe("explore ambiguous floors", () => {
  test("an ambiguous column ahead is skipped by trying other distances on the same bearing", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    const goTo = driveGoto(t.handle, [
      { refuse: "pick_destination: destination is not on a ground floor" },
      { arrive: { x: 10, y: 0 } },
    ]);
    const result = await explore(toolCtx(t), { direction: "N" });
    expect(goTo).toHaveBeenNthCalledWith(2, { kind: "point", x: 10, y: 0 });
    expect(result.obstructed).toBe(0);
    expect(t.rt.travel.blockedBearings.get(`${MAP_ID}:0:0`)).toBeUndefined();
  });

  test("an ambiguous column at every distance blocks the bearing", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    const goTo = driveGoto(t.handle, [
      { refuse: "pick_destination: destination is not on a ground floor" },
    ]);
    await explore(toolCtx(t), { direction: "N" });
    const north = goTo.mock.calls
      .map((call) => call[0])
      .filter((target) => target.kind === "point" && target.y === 0);
    expect(north.length).toBeGreaterThan(1);
    expect(t.rt.travel.blockedBearings.get(`${MAP_ID}:0:0`)?.has("N")).toBe(
      true,
    );
  });
});

describe("explore obstruction budget with probed distances", () => {
  test("an exhausted ambiguous bearing counts once, so an open perpendicular bearing is still tried", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    t.rt.travel.blockedBearings.set(`${MAP_ID}:0:0`, new Set(["NE", "NW"]));
    const goTo = driveGoto(t.handle, [
      { refuse: "pick_destination: destination is not on a ground floor" },
      { refuse: "pick_destination: destination is not on a ground floor" },
      { refuse: "pick_destination: destination is not on a ground floor" },
      { refuse: "pick_destination: destination is not on a ground floor" },
      { arrive: { x: 0, y: -20 } },
    ]);
    await explore(toolCtx(t), { direction: "N" });
    const east = goTo.mock.calls
      .map((call) => call[0])
      .filter(
        (target) =>
          target.kind === "point" && target.x === 0 && target.y === -20,
      );
    expect(east.length).toBe(1);
  });
});
