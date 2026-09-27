import { describe, expect, test } from "bun:test";
import {
  compassTo,
  distanceTo,
  LOOK_DEFAULT_ROWS,
  LOOK_DEFAULT_YD,
  LOOK_MAX_ROWS,
  TALK_RANGE_YD,
} from "#harness/ops/range";
import { createRefTable } from "#harness/ops/refs";
import { createSightings } from "#harness/ops/sightings";
import { createTestRuntime } from "#test-support/runtime-fixture";
import {
  nearbyRow,
  ORIGIN,
  selfPose,
  selfRow,
  setWorld,
  unitEntity,
} from "#test-support/world-fixtures";

async function world() {
  const clock = { now: () => 0 };
  const { handle, rt } = await createTestRuntime({
    parts: { clock, refs: createRefTable(), sightings: createSightings(clock) },
  });
  return { ctx: { handle, rt }, handle, rt };
}

describe("range helpers", () => {
  test("constants match the design", () => {
    expect([
      TALK_RANGE_YD,
      LOOK_DEFAULT_YD,
      LOOK_DEFAULT_ROWS,
      LOOK_MAX_ROWS,
    ]).toEqual([5, 60, 6, 20]);
  });

  test("distanceTo reads a unit in view", async () => {
    const { ctx, handle } = await world();
    setWorld(handle, {
      pose: selfPose(0),
      rows: [selfRow(), nearbyRow(unitEntity({ dx: 12, guid: 0x50n }))],
    });
    expect(distanceTo(ctx, 0x50n)).toBe(12);
  });

  test("distanceTo falls back to the sighting on the same map", async () => {
    const { ctx, handle, rt } = await world();
    rt.sightings.note(
      nearbyRow(unitEntity({ dx: 90, dy: 0, guid: 0x60n, name: "Mana Wyrm" })),
    );
    setWorld(handle, {
      pose: selfPose(0, { x: ORIGIN.x + 30 }),
      rows: [selfRow()],
    });
    expect(distanceTo(ctx, 0x60n)).toBe(60);
    setWorld(handle, { pose: selfPose(0, { mapId: 1 }), rows: [selfRow()] });
    expect(distanceTo(ctx, 0x60n)).toBeUndefined();
  });

  test("compassTo uses WoW axes", () => {
    expect(compassTo({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe("N");
    expect(compassTo({ x: 0, y: 0 }, { x: 0, y: -10 })).toBe("E");
    expect(compassTo({ x: 0, y: 0 }, { x: -10, y: 10 })).toBe("SW");
  });
});
