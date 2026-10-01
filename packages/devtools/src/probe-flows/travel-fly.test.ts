import { describe, expect, jest, test } from "bun:test";
import type { UnitEntity, WorldHandle } from "@peon/core";
import { fakeAwait, withFakeTimers } from "@peon/core/test-support/fake-time";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/travel-fly";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];

const MASTER = 0xf1_30_00_3d_c1_00_04_57n;

function row(guid: bigint, distance: number, roles: Row["roles"]): Row {
  const position = { mapId: 530, orientation: 0, x: 1, y: 2, z: 3 };
  const entity: UnitEntity = {
    class_: 1,
    displayId: 1,
    entry: 16_209,
    factionTemplate: 1604,
    gender: 0,
    guid,
    health: 100,
    level: 30,
    maxHealth: 100,
    maxPower: [],
    name: "Flight Master",
    npcFlags: 0x20_00,
    objectType: 3,
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
    distance,
    entity,
    horizontalDistance: distance,
    lootable: false,
    originSource: null,
    originUpdatedAt: null,
    position,
    positionKind: null,
    positionObservedAt: null,
    positionSource: null,
    preparedAt: 0,
    relation: "friendly",
    remotePose: undefined,
    roles,
    self: false,
    tapped: false,
    tappedByOther: false,
    targetOf: undefined,
    turnRadians: null,
  };
}

function context(
  args: Record<string, string>,
  rows: Row[],
): FlowContext & { handle: MockHandle } {
  const handle = createMockHandle();
  handle.queryNearby = () => rows;
  return { args, handle, settle: settleWithin(200) };
}

describe("travel-fly flow", () => {
  test("flies the planned route and waits for flight_landed", () =>
    withFakeTimers(async () => {
      const ctx = context({ to: "Silvermoon" }, [
        row(MASTER, 3, ["flight_master"]),
      ]);
      const planned = {
        destination: 82,
        nodes: [83, 82],
        price: 210,
        status: "ok",
      } as const;
      ctx.handle.travel.act.openTaxiMap = (async () => ({
        currentNode: 83,
        kind: "map",
        known: [82, 83],
        status: "ok",
      })) as typeof ctx.handle.travel.act.openTaxiMap;
      ctx.handle.travel.act.destinations = (async () => ({
        from: 83,
        list: [{ known: true, name: "Silvermoon City", node: 82, price: 210 }],
        node: { id: 83, map: 530, name: "Tranquillien", x: 1, y: 1, z: 1 },
        status: "ok",
      })) as typeof ctx.handle.travel.act.destinations;
      ctx.handle.travel.act.planFlight = (async () =>
        planned) as typeof ctx.handle.travel.act.planFlight;
      const activate = jest.spyOn(ctx.handle.travel.act, "activateTaxi");
      activate.mockImplementation(async () => {
        setTimeout(
          () =>
            ctx.handle.triggerAreaEvent("travel", { type: "flight_landed" }),
          10,
        );
        return { nodes: [83, 82], price: 210, status: "ok" };
      });
      const result = await fakeAwait(flow.run(ctx), 1000);
      expect(activate).toHaveBeenCalledWith(MASTER, planned, undefined);
      expect(result).toMatchObject({
        flight: { nodes: [83, 82], price: 210, status: "ok" },
        from: 83,
      });
    }));
});
