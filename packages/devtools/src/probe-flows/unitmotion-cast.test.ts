import { describe, expect, test } from "bun:test";
import type { UnitEntity, WorldHandle } from "@peon/core";
import {
  elapse,
  fakeAwait,
  fakeRejection,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/unitmotion-cast";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];
type Spec = {
  guid: bigint;
  distance: number;
  attackable?: boolean;
  relation?: Row["relation"];
  self?: boolean;
};

const ME = 0x2an;
const CUB = 0xf1_30_00_3b_06_00_00_01n;
const LYNX = 0xf1_30_00_3b_07_00_00_02n;
const GUARD = 0xf1_30_00_3b_09_00_00_04n;

function row(spec: Spec): Row {
  const position = { mapId: 530, orientation: 0, x: 1, y: 2, z: 3 };
  const entity: UnitEntity = {
    class_: 1,
    displayId: 1,
    entry: 15_366,
    factionTemplate: 14,
    gender: 0,
    guid: spec.guid,
    health: 100,
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

function speed(handle: MockHandle, guid: bigint, value: number) {
  handle.triggerAreaEvent("unitmotion", {
    guid,
    kind: "run",
    previous: 7,
    self: false,
    type: "speed",
    value,
  });
}

describe("unitmotion-cast flow", () => {
  test("walks into range, casts at the nearest hostile creature and lists its speed changes", () =>
    withFakeTimers(async () => {
      let distance = 30;
      const rows = () => [
        row({ distance: 0, guid: ME, self: true }),
        row({ attackable: false, distance: 2, guid: GUARD }),
        row({ distance: 5, guid: LYNX, relation: "neutral" }),
        row({ distance, guid: CUB }),
      ];
      const ctx = context({ spell: "116" }, rows);
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
      expect(ctx.handle.selectTarget).toHaveBeenCalledWith(CUB);
      expect(ctx.handle.cast).toHaveBeenCalledWith(116, CUB);
      expect(steps).toEqual([20, 6]);
      speed(ctx.handle, LYNX, 1);
      speed(ctx.handle, CUB, 3.5);
      ctx.handle.triggerAreaEvent("unitmotion", {
        flag: "root",
        flags: 1,
        guid: CUB,
        on: true,
        self: false,
        type: "flag",
      });
      speed(ctx.handle, CUB, 7);
      expect(await fakeAwait(running, 21_000)).toEqual({
        flags: [{ flag: "root", on: true }],
        speeds: [
          { kind: "run", previous: 7, value: 3.5 },
          { kind: "run", previous: 7, value: 7 },
        ],
        spell: 116,
        target: expect.objectContaining({ guid: "0xf130003b06000001" }),
      });
    }));

  test("casts even when the creature stands on the character", () =>
    withFakeTimers(async () => {
      const rows = () => [
        row({ distance: 0, guid: ME, self: true }),
        row({ distance: 0, guid: CUB }),
      ];
      const ctx = context({ seconds: "1", spell: "116" }, rows);
      ctx.handle.faceGuid.mockImplementation(() => {
        throw new Error("target_coincident");
      });
      const running = flow.run(ctx);
      await elapse(50);
      expect(ctx.handle.cast).toHaveBeenCalledWith(116, CUB);
      expect(await fakeAwait(running, 2000)).toMatchObject({ spell: 116 });
    }));

  test("fails with no spell, no hostile creature or a bad wait", () =>
    withFakeTimers(async () => {
      const lone = () => [row({ distance: 0, guid: ME, self: true })];
      const near = () => [row({ distance: 3, guid: CUB })];
      expect(await fakeRejection(flow.run(context({}, near)), 1000)).toContain(
        "spell=<id>",
      );
      expect(
        await fakeRejection(flow.run(context({ spell: "116" }, lone)), 1000),
      ).toContain("no hostile creature");
      expect(
        await fakeRejection(
          flow.run(context({ seconds: "0", spell: "116" }, near)),
          1000,
        ),
      ).toContain("seconds > 0");
    }));
});
