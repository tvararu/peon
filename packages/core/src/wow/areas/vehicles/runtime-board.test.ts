import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { vehiclesMonsterMoveTransportBody } from "#test-support/areas/vehicles";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { SplineFlag } from "#wow/protocol/monster-move";
import { GameOpcode } from "#wow/protocol/opcodes";

const SELF = 0xf1_30_00_3e_ea_00_0a_bcn;
const VEHICLE = 0xf1_30_00_3e_ea_00_0b_bcn;

function unit(guid: bigint): Entity {
  return {
    createComplete: true,
    entry: 0,
    guid,
    name: undefined,
    npcFlags: 0,
    objectType: ObjectType.UNIT,
    position: undefined,
    rawFields: new Map(),
    scale: 1,
  } as unknown as Entity;
}

function rigWith(flags: Map<bigint, number>) {
  return areaRig("vehicles", {
    getEntity: (guid) => (flags.has(guid) ? unit(guid) : undefined),
    selfGuid: SELF,
  });
}

describe("vehicles boarding in control", () => {
  test("boarding forwards the spline id and duration to control", () => {
    const rig = rigWith(new Map());
    const received: unknown[] = [];
    const off = rig.stores.self.onEvent((event) => received.push(event));
    try {
      rig.inject(
        GameOpcode.SMSG_MONSTER_MOVE_TRANSPORT,
        vehiclesMonsterMoveTransportBody({
          flags: SplineFlag.TRANSPORT_ENTER,
          guid: SELF,
          seat: 0,
          stop: false,
          transportGuid: VEHICLE,
        }),
      );
      expect(received.at(-1)).toMatchObject({
        duration: 1000,
        seat: 0,
        splineId: 9,
        type: "vehicle_seat",
        vehicle: VEHICLE,
        vehiclePose: undefined,
      });
    } finally {
      off();
      rig.dispose();
    }
  });

  test("boarding carries the vehicle entity pose when the vehicle is known", () => {
    const rig = areaRig("vehicles", {
      getEntity: (guid) =>
        guid === VEHICLE
          ? {
              ...unit(guid),
              position: { mapId: 571, orientation: 0, x: 100, y: 200, z: 50 },
            }
          : undefined,
      selfGuid: SELF,
    });
    const received: unknown[] = [];
    const off = rig.stores.self.onEvent((event) => received.push(event));
    try {
      rig.inject(
        GameOpcode.SMSG_MONSTER_MOVE_TRANSPORT,
        vehiclesMonsterMoveTransportBody({
          flags: SplineFlag.TRANSPORT_ENTER,
          guid: SELF,
          seat: 0,
          stop: false,
          transportGuid: VEHICLE,
        }),
      );
      expect(received.at(-1)).toMatchObject({
        type: "vehicle_seat",
        vehiclePose: { mapId: 571, x: 100, y: 200, z: 50 },
      });
    } finally {
      off();
      rig.dispose();
    }
  });
});
