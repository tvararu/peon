import { describe, expect, test } from "bun:test";
import type { UnitEntity, WorldHandle } from "@peon/core";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/achievements-level";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];
type Spec = {
  guid: bigint;
  distance: number;
  health?: number;
  objectType?: 3 | 4;
  attackable?: boolean;
  self?: boolean;
  relation?: Row["relation"];
};

const ME = 0x2an;
const CUB = 0xf1_30_00_3b_06_00_00_01n;
const GUARD = 0xf1_30_00_3b_09_00_00_04n;
const FAR = 0xf1_30_00_3b_08_00_00_03n;

function row(spec: Spec): Row {
  const position = { mapId: 530, orientation: 0, x: 1, y: 2, z: 3 };
  const entity: UnitEntity = {
    class_: 1,
    displayId: 1,
    entry: 15_366,
    factionTemplate: 14,
    gender: 0,
    guid: spec.guid,
    health: spec.health ?? 100,
    level: 8,
    maxHealth: 100,
    maxPower: [],
    name: "Unit",
    npcFlags: 0,
    objectType: spec.objectType ?? 3,
    position,
    power: [],
    race: 0,
    rawFields: new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
  return {
    attackable: spec.attackable ?? true,
    attackingMe: false,
    bearingRadians: null,
    distance: spec.distance,
    entity,
    horizontalDistance: spec.distance,
    lootable: false,
    originSource: null,
    originUpdatedAt: null,
    position,
    positionKind: null,
    positionObservedAt: null,
    positionSource: null,
    preparedAt: 0,
    relation: spec.relation ?? "hostile",
    remotePose: undefined,
    roles: [],
    self: spec.self ?? false,
    tapped: false,
    tappedByOther: false,
    targetOf: undefined,
    turnRadians: null,
  };
}

function context(
  args: Record<string, string>,
  rows: () => Row[],
): FlowContext & { handle: MockHandle } {
  const handle = createMockHandle();
  handle.queryNearby = rows;
  return { args, handle, settle: settleWithin(200) };
}

function world() {
  const health = new Map<bigint, number>([
    [ME, 100],
    [CUB, 100],
  ]);
  const rows = () => [
    row({
      distance: 0,
      guid: ME,
      health: health.get(ME) ?? 0,
      objectType: 4,
      self: true,
    }),
    row({ attackable: false, distance: 2, guid: GUARD }),
    row({ distance: 3, guid: CUB, health: health.get(CUB) ?? 0 }),
    row({ distance: 50, guid: FAR }),
  ];
  return { health, rows };
}

describe("achievements-level flow", () => {
  test("attacks the nearest attackable hostile creature until it dies", async () => {
    const { health, rows } = world();
    const ctx = context({ linger: "0", seconds: "5" }, rows);
    const running = flow.run(ctx);
    await Bun.sleep(50);
    ctx.handle.triggerAreaEvent("achievements", {
      guid: ME,
      id: 7,
      self: true,
      type: "achievement_earned",
    });
    health.set(CUB, 0);
    expect(await running).toMatchObject({
      earned: [{ id: 7, self: true }],
      stop: "target_dead",
      target: { guid: "0xf130003b06000001" },
    });
    expect(ctx.handle.attack).toHaveBeenCalledWith(CUB);
    expect(ctx.handle.attack).not.toHaveBeenCalledWith(GUARD);
  });

  test("stops when the character dies", async () => {
    const { health, rows } = world();
    const ctx = context({ linger: "0", seconds: "5" }, rows);
    const running = flow.run(ctx);
    await Bun.sleep(50);
    health.set(ME, 0);
    expect(await running).toMatchObject({ stop: "self_dead" });
  });

  test("stops at the time limit", async () => {
    const { rows } = world();
    const ctx = context({ linger: "0", seconds: "0.3" }, rows);
    expect(await flow.run(ctx)).toMatchObject({ stop: "timeout" });
  });

  test("refuses when no hostile creature is within 35 yards", async () => {
    const ctx = context({ linger: "0" }, () => [
      row({ distance: 0, guid: ME, objectType: 4, self: true }),
      row({ distance: 50, guid: FAR }),
    ]);
    await expect(flow.run(ctx)).rejects.toThrow(
      "no hostile creature within 35",
    );
  });
});
