import { describe, expect, test } from "bun:test";
import type { NearbyRow } from "@peon/core";
import { createRefTable } from "#harness/ops/refs";
import { resolveUnit, unitRefusal } from "#harness/ops/resolve";
import { createSightings } from "#harness/ops/sightings";
import { createTestRuntime } from "#test-support/runtime-fixture";
import {
  nearbyRow,
  selfPose,
  selfRow,
  setWorld,
  unitEntity,
} from "#test-support/world-fixtures";

async function world(rows: NearbyRow[]) {
  const clock = { now: () => 1000 };
  const { handle, rt } = await createTestRuntime({
    parts: { clock, refs: createRefTable(), sightings: createSightings(clock) },
  });
  setWorld(handle, { pose: selfPose(1000), rows: [selfRow(), ...rows] });
  return { ctx: { handle, rt }, handle, rt };
}

const named = (name: string, guid: bigint, dx: number, health = 100) =>
  nearbyRow(unitEntity({ dx, guid, health, name }), { relation: "hostile" });

describe("resolveUnit", () => {
  test("a ref gives that unit", async () => {
    const { ctx } = await world([named("Springpaw Stalker", 0x50n, 20)]);
    expect(resolveUnit(ctx, { text: "u1" })).toMatchObject({
      guid: 0x50n,
      kind: "unit",
      unit: { ref: "u1" },
    });
  });

  test("an unknown ref is not seen", async () => {
    const { ctx } = await world([]);
    expect(resolveUnit(ctx, { text: "u42" })).toEqual({
      kind: "not_seen",
      text: "u42",
    });
  });

  test("an exact name gives the nearest living match", async () => {
    const { ctx } = await world([
      named("Springpaw Stalker", 0x50n, 10, 0),
      named("Springpaw Stalker", 0x51n, 40),
    ]);
    expect(resolveUnit(ctx, { text: "springpaw stalker" })).toMatchObject({
      guid: 0x51n,
      kind: "unit",
    });
  });

  test("part of a name with one name among the matches gives the nearest living one", async () => {
    const { ctx } = await world([
      named("Springpaw Stalker", 0x50n, 30),
      named("Springpaw Stalker", 0x51n, 20),
    ]);
    expect(resolveUnit(ctx, { text: "stalker" })).toMatchObject({
      guid: 0x51n,
      kind: "unit",
    });
  });

  test("part of a name with different names is ambiguous, nearest first", async () => {
    const { ctx } = await world([
      named("Springpaw Stalker", 0x50n, 20),
      named("Springpaw Cub", 0x51n, 10),
    ]);
    const resolved = resolveUnit(ctx, { text: "springpaw" });
    expect(resolved.kind).toBe("ambiguous");
    expect(
      resolved.kind === "ambiguous" &&
        resolved.candidates.map((unit) => unit.name),
    ).toEqual(["Springpaw Cub", "Springpaw Stalker"]);
  });

  test("a name nobody has is not seen", async () => {
    const { ctx } = await world([named("Springpaw Stalker", 0x50n, 20)]);
    expect(resolveUnit(ctx, { text: "Kobold" })).toEqual({
      kind: "not_seen",
      text: "Kobold",
    });
  });

  test("finds a unit out of view in the sightings", async () => {
    const { ctx, handle, rt } = await world([named("Mana Wyrm", 0x60n, 150)]);
    resolveUnit(ctx, { text: "u1" });
    setWorld(handle, { pose: selfPose(1000), rows: [selfRow()] });
    expect(resolveUnit(ctx, { text: "Mana Wyrm" })).toMatchObject({
      guid: 0x60n,
      kind: "unit",
      unit: { inView: false },
    });
    expect(rt.refs.refOf(0x60n)).toBe("u1");
  });

  test("applies the alive, lootable and relation filters to names", async () => {
    const corpse = nearbyRow(
      unitEntity({ dx: 5, guid: 0x52n, health: 0, name: "Springpaw Stalker" }),
      { lootable: true, relation: "hostile" },
    );
    const { ctx } = await world([
      corpse,
      named("Springpaw Stalker", 0x53n, 15),
    ]);
    expect(resolveUnit(ctx, { lootable: true, text: "stalker" })).toMatchObject(
      { guid: 0x52n },
    );
    expect(resolveUnit(ctx, { alive: true, text: "stalker" })).toMatchObject({
      guid: 0x53n,
    });
    expect(
      resolveUnit(ctx, { relation: ["friendly"], text: "stalker" }).kind,
    ).toBe("not_seen");
  });
});

describe("unitRefusal", () => {
  test("ambiguous lists ready calls, nearest first", async () => {
    const { ctx } = await world([
      named("Springpaw Cub", 0x51n, 10),
      named("Springpaw Stalker", 0x50n, 20),
    ]);
    const resolved = resolveUnit(ctx, { text: "springpaw" });
    if (resolved.kind !== "ambiguous") throw new Error("expected ambiguous");
    const refusal = unitRefusal({ param: "target", resolved, tool: "engage" });
    expect(refusal.reason).toBe("ambiguous_unit");
    expect(refusal.detail).toContain("2");
    expect(refusal.detail).toContain("Springpaw Cub");
    expect(refusal.detail).toContain("Springpaw Stalker");
    expect(refusal.body).toEqual([
      'Springpaw Cub u1, 10 yd N: engage(target: "u1")',
      'Springpaw Stalker u2, 20 yd N: engage(target: "u2")',
    ]);
    expect(refusal.next).toBe('engage(target: "u1")');
    expect(refusal.options).toEqual(["u1", "u2"]);
  });

  test("not seen points at explore", () => {
    const refusal = unitRefusal({
      param: "npc",
      resolved: { kind: "not_seen", text: "Kobold" },
      tool: "interact",
    });
    expect(refusal.reason).toBe("not_seen");
    expect(refusal.detail).toContain("Kobold");
    expect(refusal.next).toBe('travel(to: "explore")');
  });
});
