import { describe, expect, test } from "bun:test";
import type { UnitEntity, WorldHandle } from "@peon/core";
import {
  elapse,
  fakeAwait,
  fakeRejection,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import { createMockHandle } from "@peon/core/test-support/mock-handle";
import { settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/unitmotion-toggle";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];
type Spec = {
  guid: bigint;
  distance: number;
  relation?: Row["relation"];
  self?: boolean;
};

const ME = 0x2an;
const FOE = 0xf1_30_00_3b_06_00_00_01n;
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
    attackable: false,
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
    relation: spec.relation ?? "friendly",
    remotePose: undefined,
    roles: [],
    self: spec.self ?? false,
    tapped: false,
    tappedByOther: false,
    targetOf: undefined,
    turnRadians: null,
  };
}

describe("unitmotion-toggle flow", () => {
  test("casts at the nearest friendly unit and lists its flag changes", () =>
    withFakeTimers(async () => {
      const handle = createMockHandle();
      handle.queryNearby = () => [
        row({ distance: 0, guid: ME, self: true }),
        row({ distance: 3, guid: FOE, relation: "hostile" }),
        row({ distance: 8, guid: GUARD }),
      ];
      const running = flow.run({
        args: { seconds: "5", spell: "546" },
        handle,
        settle: settleWithin(200),
      });
      await elapse(50);
      expect(handle.selectTarget).toHaveBeenCalledWith(GUARD);
      expect(handle.cast).toHaveBeenCalledWith(546, GUARD);
      handle.triggerAreaEvent("unitmotion", {
        flag: "water_walking",
        flags: 0x10_00_00_00,
        guid: GUARD,
        on: true,
        self: false,
        type: "flag",
      });
      handle.triggerAreaEvent("unitmotion", {
        flag: "hover",
        flags: 1,
        guid: FOE,
        on: true,
        self: false,
        type: "flag",
      });
      expect(await fakeAwait(running, 6000)).toMatchObject({
        flags: [{ flag: "water_walking", flags: 0x10_00_00_00, on: true }],
        spell: 546,
      });
    }));

  test("fails with no spell, a bad wait or no unit in sight", () =>
    withFakeTimers(async () => {
      const handle = createMockHandle();
      handle.queryNearby = () => [row({ distance: 0, guid: ME, self: true })];
      const ctx = (args: Record<string, string>) => ({
        args,
        handle,
        settle: settleWithin(200),
      });
      expect(await fakeRejection(flow.run(ctx({})), 1000)).toContain(
        "spell=<id>",
      );
      expect(
        await fakeRejection(
          flow.run(ctx({ seconds: "0", spell: "546" })),
          1000,
        ),
      ).toContain("seconds > 0");
      expect(
        await fakeRejection(flow.run(ctx({ spell: "546" })), 1000),
      ).toContain("no unit to target");
      expect(handle.cast).not.toHaveBeenCalled();
    }));
});
