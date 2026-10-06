import { describe, expect, test } from "bun:test";
import type { TravelAfter } from "#harness/contract/details";
import { travelSpec } from "#harness/tools/travel";
import {
  contentOf,
  driveGoto,
  setSelf,
  toolCtx,
} from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

async function world() {
  const t = await createTestRuntime();
  setSelf(t.handle, { x: 100, y: 200 });
  return t;
}

describe("travel <N> yd <direction>", () => {
  test.each([
    ["10 yd north", 110, 200],
    ["10 yd south", 90, 200],
    ["5 yd west", 100, 205],
    ["5 yd east", 100, 195],
    ["12.5 yd north", 112.5, 200],
    ["10 YD North", 110, 200],
    ["10 yds north", 110, 200],
    ["10 yards north", 110, 200],
    ["10yd north", 110, 200],
  ])("%s goes to the same point as coordinates", async (to, x, y) => {
    const t = await world();
    const goTo = driveGoto(t.handle, [{ arrive: { x, y } }]);
    const res = await travelSpec.run({ to }, toolCtx<TravelAfter>(t));
    expect(goTo).toHaveBeenCalledTimes(1);
    expect(goTo).toHaveBeenCalledWith({ kind: "point", x, y });
    expect(res.status).toBe("DONE");
  });

  test("a diagonal walks the full distance along it", async () => {
    const t = await world();
    const goTo = driveGoto(t.handle, [{ arrive: { x: 100, y: 200 } }]);
    await travelSpec.run({ to: "10 yd northwest" }, toolCtx<TravelAfter>(t));
    const target = goTo.mock.calls[0]?.[0];
    if (target?.kind !== "point") throw new Error("not a point");
    expect(Math.hypot(target.x - 100, target.y - 200)).toBeCloseTo(10, 6);
    expect(target.x).toBeGreaterThan(100);
    expect(target.y).toBeGreaterThan(200);
  });

  test("a refusal matches the same point as coordinates", async () => {
    const refuse = "unreachable: pathfind_find_path failed (UNKNOWN_PATH)";
    const byCoords = await world();
    driveGoto(byCoords.handle, [{ refuse }]);
    const expected = await travelSpec.run(
      { to: "110, 200" },
      toolCtx<TravelAfter>(byCoords),
    );
    const byYards = await world();
    driveGoto(byYards.handle, [{ refuse }]);
    const res = await travelSpec.run(
      { to: "10 yd north" },
      toolCtx<TravelAfter>(byYards),
    );
    expect(res.status).toBe(expected.status);
    expect(res.reason).toBe(expected.reason);
  });

  test.each([
    "0 yd north",
    "-5 yd north",
    "201 yd north",
    "10 yd up",
    "10 yd",
    "ten yd north",
  ])("%s refuses before any walk", async (to) => {
    const t = await world();
    const goTo = driveGoto(t.handle, [{ arrive: { x: 0, y: 0 } }]);
    await expect(
      travelSpec.run({ to }, toolCtx<TravelAfter>(t)),
    ).rejects.toThrow();
    expect(goTo).not.toHaveBeenCalled();
  });

  test("the largest distance is accepted", async () => {
    const t = await world();
    const goTo = driveGoto(t.handle, [{ arrive: { x: 300, y: 200 } }]);
    await travelSpec.run({ to: "200 yd north" }, toolCtx<TravelAfter>(t));
    expect(goTo).toHaveBeenCalledWith({ kind: "point", x: 300, y: 200 });
  });

  test("contentOf names the point it walks to", async () => {
    const t = await world();
    driveGoto(t.handle, [{ arrive: { x: 110, y: 200 } }]);
    const res = await travelSpec.run(
      { to: "10 yd north" },
      toolCtx<TravelAfter>(t),
    );
    expect(contentOf(res)).toContain("110, 200");
  });
});
