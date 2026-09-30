import { describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import { areaRig } from "#test-support/area-rig";
import {
  vehiclesCreateVehicleBlock,
  vehiclesMonsterMoveTransportBody,
  vehiclesPlayerVehicleDataBody,
} from "#test-support/areas/vehicles";
import type { VehiclesEvent } from "#wow/areas/vehicles/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";

const GUID = 0xf1_30_00_3e_ea_00_0a_bcn;
const TRANSPORT = 0xf1_30_00_3e_ea_00_0b_bcn;
const STRANGER = 0xf1_30_00_3e_ea_00_0c_bcn;

function rigWithEvents() {
  const rig = areaRig("vehicles");
  const seen: VehiclesEvent[] = [];
  const errors: [number, Error][] = [];
  rig.handle.onEvent((event) => seen.push(event));
  rig.events.packetError.subscribe((opcode, error) =>
    errors.push([opcode, error]),
  );
  return { errors, rig, seen };
}

function compressed(body: Uint8Array): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(body.byteLength);
  w.rawBytes(new Uint8Array(deflateSync(body)));
  return w.finish();
}

describe("vehicles area wiring", () => {
  test("SMSG_PLAYER_VEHICLE_DATA sets the id and id 0 deletes it (Unit.cpp:10242-10245,10309-10312)", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_PLAYER_VEHICLE_DATA,
        vehiclesPlayerVehicleDataBody({ guid: GUID, vehicleId: 315 }),
      );
      expect(rig.handle.state().vehicleIds.get(GUID)).toBe(315);
      rig.inject(
        GameOpcode.SMSG_PLAYER_VEHICLE_DATA,
        vehiclesPlayerVehicleDataBody({ guid: GUID, vehicleId: 0 }),
      );
      expect(rig.handle.state().vehicleIds.has(GUID)).toBe(false);
      expect(seen).toEqual([
        { guid: GUID, type: "player_vehicle", vehicleId: 315 },
        { guid: GUID, type: "player_vehicle", vehicleId: 0 },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("an empty SMSG_ON_CANCEL_EXPECTED_RIDE_VEHICLE_AURA only records the cancel", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_ON_CANCEL_EXPECTED_RIDE_VEHICLE_AURA,
        new Uint8Array(0),
      );
      expect(seen).toEqual([{ type: "ride_aura_cancel" }]);
      expect(rig.handle.state().vehicleIds.size).toBe(0);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_MONSTER_MOVE_TRANSPORT records the seat and emits the spline (MoveSplineInit.cpp:114-124)", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_MONSTER_MOVE_TRANSPORT,
        vehiclesMonsterMoveTransportBody({
          guid: GUID,
          seat: 2,
          stop: false,
          transportGuid: TRANSPORT,
        }),
      );
      expect(rig.handle.state().passengers.get(GUID)).toEqual({
        seat: 2,
        transportGuid: TRANSPORT,
      });
      expect(seen).toEqual([
        {
          duration: 1000,
          flags: 0,
          guid: GUID,
          seat: 2,
          splineId: 9,
          transportGuid: TRANSPORT,
          type: "spline",
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a peeked create block with UPDATEFLAG_VEHICLE sets the id, plain and compressed (Object.cpp:478-486)", () => {
    const { rig, seen } = rigWithEvents();
    try {
      const body = vehiclesCreateVehicleBlock({
        guid: STRANGER,
        orientation: 1.5,
        vehicleId: 315,
      });
      rig.inject(GameOpcode.SMSG_UPDATE_OBJECT, body);
      expect(rig.handle.state().vehicleIds.get(STRANGER)).toBe(315);
      rig.inject(GameOpcode.SMSG_COMPRESSED_UPDATE_OBJECT, compressed(body));
      expect(rig.handle.state().vehicleIds.get(STRANGER)).toBe(315);
      expect(seen).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("out-of-range and destroy entries delete the id", () => {
    const { rig } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_PLAYER_VEHICLE_DATA,
        vehiclesPlayerVehicleDataBody({ guid: GUID, vehicleId: 315 }),
      );
      const destroy = new PacketWriter();
      destroy.uint64LE(GUID);
      destroy.uint8(0);
      rig.inject(GameOpcode.SMSG_DESTROY_OBJECT, destroy.finish());
      expect(rig.handle.state().vehicleIds.has(GUID)).toBe(false);
    } finally {
      rig.dispose();
    }
  });

  test("a malformed peeked update block reaches packetError (world.ts:292-295)", () => {
    const { errors, rig } = rigWithEvents();
    try {
      rig.inject(GameOpcode.SMSG_UPDATE_OBJECT, new Uint8Array([1, 2, 3]));
      expect(errors).toHaveLength(1);
      expect(errors[0]?.[0]).toBe(GameOpcode.SMSG_UPDATE_OBJECT);
    } finally {
      rig.dispose();
    }
  });
});
