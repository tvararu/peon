import { describe, expect, test } from "bun:test";
import { createRefTable } from "#harness/ops/refs";
import { repeatScene } from "#harness/ops/repeat-scene";
import { createSightings } from "#harness/ops/sightings";
import { createTestRuntime } from "#test-support/runtime-fixture";
import {
  nearbyRow,
  selfPose,
  selfRow,
  setWorld,
  unitEntity,
} from "#test-support/world-fixtures";

async function world(attackers: bigint[]) {
  const clock = { now: () => 1000 };
  const { handle, rt } = await createTestRuntime({
    parts: { clock, refs: createRefTable(), sightings: createSightings(clock) },
  });
  const stalker = nearbyRow(
    unitEntity({ dx: 12, guid: 0x50n, name: "Springpaw Stalker" }),
    { relation: "hostile" },
  );
  setWorld(handle, {
    combat: { attackers },
    pose: selfPose(1000),
    rows: [selfRow(), stalker],
  });
  rt.refs.refOf(0x50n);
  return { handle, rt };
}

describe("repeatScene", () => {
  test("gives the target distance and whether it attacks you", async () => {
    const ctx = await world([0x50n]);
    expect(repeatScene(ctx, { target: "u1" })).toEqual({
      combat: "50",
      targetAttacking: true,
      targetYd: 12,
    });
  });

  test("reads npc and to as the target too", async () => {
    const ctx = await world([]);
    for (const args of [{ npc: "Springpaw Stalker" }, { to: "u1" }])
      expect(repeatScene(ctx, args)).toEqual({
        combat: "",
        targetAttacking: false,
        targetYd: 12,
      });
  });

  test("a call with no unit target has no distance", async () => {
    const ctx = await world([]);
    expect(repeatScene(ctx, { to: "explore north" }).targetYd).toBeUndefined();
    expect(repeatScene(ctx, { quest: "8325" }).targetYd).toBeUndefined();
  });
});
