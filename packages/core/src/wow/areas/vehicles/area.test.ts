import { describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import { areaRig } from "#test-support/area-rig";
import {
  vehiclesCreateSelfOnTransportBlock,
  vehiclesCreateVehicleBlock,
  vehiclesMonsterMoveBody,
  vehiclesMonsterMoveTransportBody,
  vehiclesPlayerVehicleDataBody,
} from "#test-support/areas/vehicles";
import { writePackedGuid } from "#test-support/world-handlers-fixtures";
import type { VehiclesEvent } from "#wow/areas/vehicles/store";
import { UpdateType } from "#wow/protocol/entity-fields";
import { SplineFlag } from "#wow/protocol/monster-move";
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
          offset: { x: 10, y: 0, z: 0 },
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

  test("the live self boarding body (probe click11) parses to seat 0 with TRANSPORT_ENTER", () => {
    const { rig, seen } = rigWithEvents();
    const body = Uint8Array.from(
      Buffer.from(
        "035111dbd13d426c50f100003333b3bf000000000000000081fff92804000000000000800001000000010000003333b3bf0000000000000000",
        "hex",
      ),
    );
    try {
      rig.inject(GameOpcode.SMSG_MONSTER_MOVE_TRANSPORT, body);
      expect(seen).toEqual([
        {
          duration: 1,
          flags: SplineFlag.TRANSPORT_ENTER,
          guid: 0x1151n,
          offset: { x: -1.399_999_976_158_142, y: 0, z: 0 },
          seat: 0,
          splineId: 0x28_f9_ff_81,
          transportGuid: 0xf1_50_00_6c_42_00_3d_d1n,
          type: "spline",
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("the captured boarding offset equals the staged VehicleSeat.dbc attachment offset", () => {
    const { rig, seen } = rigWithEvents();
    const seatRecord = {
      attachmentId: 13,
      attachmentOffsetWords: [0xbf_b3_33_33, 0, 0],
      flags: 0x63_00_08_06,
      id: 1301,
    };
    const words = new DataView(new ArrayBuffer(12));
    seatRecord.attachmentOffsetWords.forEach((word, index) => {
      words.setUint32(index * 4, word, true);
    });
    const dbcOffset = {
      x: words.getFloat32(0, true),
      y: words.getFloat32(4, true),
      z: words.getFloat32(8, true),
    };
    try {
      rig.inject(
        GameOpcode.SMSG_MONSTER_MOVE_TRANSPORT,
        Uint8Array.from(
          Buffer.from(
            "035111dbd13d426c50f100003333b3bf000000000000000081fff92804000000000000800001000000010000003333b3bf0000000000000000",
            "hex",
          ),
        ),
      );
      const spline = seen.find((event) => event.type === "spline");
      expect(spline).toMatchObject({
        offset: dbcOffset,
        seat: 0,
        transportGuid: 0xf1_50_00_6c_42_00_3d_d1n,
      });
    } finally {
      rig.dispose();
    }
  });

  test("a plain SMSG_MONSTER_MOVE with TRANSPORT_EXIT removes the passenger and emits the exit", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_MONSTER_MOVE_TRANSPORT,
        vehiclesMonsterMoveTransportBody({
          flags: SplineFlag.TRANSPORT_ENTER,
          guid: GUID,
          seat: 1,
          stop: false,
          transportGuid: TRANSPORT,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_MONSTER_MOVE,
        vehiclesMonsterMoveBody({
          flags: SplineFlag.TRANSPORT_EXIT,
          guid: GUID,
          stop: false,
        }),
      );
      expect(rig.handle.state().passengers.has(GUID)).toBe(false);
      expect(seen.at(-1)).toMatchObject({
        flags: SplineFlag.TRANSPORT_EXIT,
        guid: GUID,
        seat: -1,
        transportGuid: TRANSPORT,
        type: "spline",
      });
    } finally {
      rig.dispose();
    }
  });

  test("a SMSG_MONSTER_MOVE for a unit that never boarded changes nothing", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_MONSTER_MOVE,
        vehiclesMonsterMoveBody({
          flags: SplineFlag.TRANSPORT_EXIT,
          guid: GUID,
          stop: false,
        }),
      );
      expect(seen).toEqual([]);
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

  test("destroy and out-of-range drop the departed rider's passenger entry", () => {
    const { rig } = rigWithEvents();
    try {
      for (const rider of [GUID, STRANGER]) {
        rig.inject(
          GameOpcode.SMSG_MONSTER_MOVE_TRANSPORT,
          vehiclesMonsterMoveTransportBody({
            guid: rider,
            seat: 1,
            stop: true,
            transportGuid: TRANSPORT,
          }),
        );
      }
      expect(rig.handle.state().passengers.size).toBe(2);
      const destroy = new PacketWriter();
      destroy.uint64LE(GUID);
      destroy.uint8(0);
      rig.inject(GameOpcode.SMSG_DESTROY_OBJECT, destroy.finish());
      expect([...rig.handle.state().passengers.keys()]).toEqual([STRANGER]);
      const gone = new PacketWriter();
      gone.uint32LE(1);
      gone.uint8(UpdateType.OUT_OF_RANGE);
      gone.uint32LE(1);
      writePackedGuid(gone, STRANGER);
      rig.inject(GameOpcode.SMSG_UPDATE_OBJECT, gone.finish());
      expect(rig.handle.state().passengers.size).toBe(0);
    } finally {
      rig.dispose();
    }
  });

  test("a self create block on a vehicle seats the character without a boarding spline", () => {
    const rig = areaRig("vehicles", { selfGuid: GUID });
    const seen: VehiclesEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      const body = vehiclesCreateSelfOnTransportBlock({
        guid: GUID,
        offset: { x: 0, y: 1, z: 2 },
        seat: 1,
        transportGuid: TRANSPORT,
      });
      rig.inject(GameOpcode.SMSG_UPDATE_OBJECT, body);
      expect(rig.handle.state().seat).toMatchObject({
        seat: 1,
        vehicle: TRANSPORT,
      });
      expect(seen).toEqual([
        {
          duration: 0,
          entry: undefined,
          facing: 0,
          offset: { x: 0, y: 1, z: 2 },
          seat: 1,
          splineId: undefined,
          type: "entered",
          vehicle: TRANSPORT,
        },
      ]);
      rig.inject(GameOpcode.SMSG_UPDATE_OBJECT, body);
      expect(seen).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("a create block for another unit on a vehicle seat changes nothing", () => {
    const rig = areaRig("vehicles", { selfGuid: GUID });
    try {
      rig.inject(
        GameOpcode.SMSG_UPDATE_OBJECT,
        vehiclesCreateSelfOnTransportBlock({
          guid: STRANGER,
          offset: { x: 0, y: 0, z: 0 },
          seat: 0,
          transportGuid: TRANSPORT,
        }),
      );
      expect(rig.handle.state().seat).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("a self create block on a transport gameobject is not a vehicle seat", () => {
    const rig = areaRig("vehicles", { selfGuid: GUID });
    try {
      rig.inject(
        GameOpcode.SMSG_UPDATE_OBJECT,
        vehiclesCreateSelfOnTransportBlock({
          guid: GUID,
          offset: { x: 0, y: 0, z: 0 },
          seat: 0,
          transportGuid: 0xf1_20_00_00_00_00_00_01n,
        }),
      );
      expect(rig.handle.state().seat).toBeUndefined();
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

  test("a destroy for an unknown guid and an empty out-of-range change nothing", () => {
    const { rig, seen } = rigWithEvents();
    try {
      const destroy = new PacketWriter();
      destroy.uint64LE(STRANGER);
      destroy.uint8(0);
      rig.inject(GameOpcode.SMSG_DESTROY_OBJECT, destroy.finish());
      const empty = new PacketWriter();
      empty.uint32LE(1);
      empty.uint8(UpdateType.OUT_OF_RANGE);
      empty.uint32LE(0);
      rig.inject(GameOpcode.SMSG_UPDATE_OBJECT, empty.finish());
      expect(rig.handle.state().vehicleIds.size).toBe(0);
      expect(seen).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a truncated transport packet throws to the caller", () => {
    const { rig } = rigWithEvents();
    try {
      expect(() =>
        rig.inject(
          GameOpcode.SMSG_MONSTER_MOVE_TRANSPORT,
          new Uint8Array([0x01, 0x17]),
        ),
      ).toThrow();
    } finally {
      rig.dispose();
    }
  });
});
