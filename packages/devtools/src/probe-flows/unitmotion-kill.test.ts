import { describe, expect, test } from "bun:test";
import type { UnitEntity, WorldHandle } from "@peon/core";
import {
  elapse,
  fakeAwait,
  fakeMsUntilSettled,
  fakeRejection,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/unitmotion-kill";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];
type Spec = {
  guid: bigint;
  distance: number;
  health?: number;
  attackable?: boolean;
  tappedByOther?: boolean;
  relation?: Row["relation"];
  self?: boolean;
};

const ME = 0x2an;
const CUB = 0xf1_30_00_3b_06_00_00_01n;
const LYNX = 0xf1_30_00_3b_07_00_00_02n;
const GUARD = 0xf1_30_00_3b_09_00_00_04n;
const TAKEN = 0xf1_30_00_3b_0a_00_00_05n;
const PET = 0xf1_40_00_00_01_00_00_07n;

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
    level: 5,
    maxHealth: 100,
    maxPower: [],
    name: "Unit",
    npcFlags: 0,
    objectType: spec.self ? 4 : 3,
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
    tappedByOther: spec.tappedByOther ?? false,
    targetOf: undefined,
    turnRadians: null,
  };
}

function world() {
  const health = new Map<bigint, number>([
    [ME, 100],
    [CUB, 100],
  ]);
  const rows = () => [
    row({ distance: 0, guid: ME, health: health.get(ME), self: true }),
    row({ attackable: false, distance: 2, guid: GUARD }),
    row({ distance: 3, guid: TAKEN, tappedByOther: true }),
    row({ distance: 4, guid: PET }),
    row({ distance: 5, guid: LYNX, relation: "neutral" }),
    row({ distance: 12, guid: CUB, health: health.get(CUB) }),
  ];
  return { health, rows };
}

function context(
  args: Record<string, string>,
  rows: () => Row[],
): FlowContext & { handle: MockHandle } {
  const handle = createMockHandle();
  handle.queryNearby = rows;
  return { args, handle, settle: settleWithin(200) };
}

function toggle(
  handle: MockHandle,
  guid: bigint,
  flag: "hover" | "disable_gravity",
) {
  handle.triggerAreaEvent("unitmotion", {
    flag,
    flags: 0,
    guid,
    on: false,
    self: false,
    type: "flag",
  });
}

describe("unitmotion-kill flow", () => {
  test("attacks the nearest living hostile creature and records its death toggles", () =>
    withFakeTimers(async () => {
      const { health, rows } = world();
      const ctx = context({ seconds: "5" }, rows);
      const running = flow.run(ctx);
      await elapse(50);
      expect(ctx.handle.selectTarget).toHaveBeenCalledWith(CUB);
      expect(ctx.handle.attack).toHaveBeenCalledWith(CUB);
      toggle(ctx.handle, LYNX, "hover");
      health.set(CUB, 0);
      toggle(ctx.handle, CUB, "hover");
      toggle(ctx.handle, CUB, "disable_gravity");
      expect(await fakeAwait(running, 1000)).toEqual({
        stop: "target_dead",
        target: expect.objectContaining({ guid: "0xf130003b06000001" }),
        toggles: ["hover", "disable_gravity"],
      });
    }));

  test("walks into melee range of a far creature", () =>
    withFakeTimers(async () => {
      let distance = 30;
      let health = 100;
      const rows = () => [
        row({ distance: 0, guid: ME, self: true }),
        row({ distance, guid: CUB, health }),
      ];
      const ctx = context({ seconds: "5" }, rows);
      const steps: number[] = [];
      ctx.handle.walkTowardPoint = async (_point, yards) => {
        steps.push(yards);
        distance -= yards;
        return {
          pose: {
            mapId: 530,
            orientation: 0,
            source: "server" as const,
            updatedAt: 0,
            x: 0,
            y: 0,
            z: 0,
          },
          status: "completed" as const,
          traveled: yards,
        };
      };
      const running = flow.run(ctx);
      await elapse(50);
      health = 0;
      expect(await fakeAwait(running, 3000)).toMatchObject({
        stop: "target_dead",
      });
      expect(steps).toEqual([20, 7]);
    }));

  test("stops when the character dies or time runs out", () =>
    withFakeTimers(async () => {
      const { health, rows } = world();
      const ctx = context({ seconds: "5" }, rows);
      const running = flow.run(ctx);
      await elapse(50);
      health.set(ME, 0);
      expect(await fakeAwait(running, 1000)).toMatchObject({
        stop: "self_dead",
        toggles: [],
      });
      const late = flow.run(context({ seconds: "0.3" }, world().rows));
      const ms = await fakeMsUntilSettled(late, 2000);
      expect(await late).toMatchObject({ stop: "timeout" });
      expect(ms).toBeGreaterThanOrEqual(300);
      expect(ms).toBeLessThan(600);
    }));

  test("fails with no hostile creature or a bad time limit", () =>
    withFakeTimers(async () => {
      const lone = () => [row({ distance: 0, guid: ME, self: true })];
      expect(await fakeRejection(flow.run(context({}, lone)), 1000)).toContain(
        "no hostile creature",
      );
      expect(
        await fakeRejection(
          flow.run(context({ seconds: "0" }, world().rows)),
          1000,
        ),
      ).toContain("seconds > 0");
    }));
});
