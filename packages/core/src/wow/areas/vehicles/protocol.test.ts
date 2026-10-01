import { describe, expect, test } from "bun:test";
import {
  vehiclesMonsterMoveTransportBody,
  vehiclesPlayerVehicleDataBody,
} from "#test-support/areas/vehicles";
import {
  buildChangeSeatsOnControlledVehicle,
  buildDismissControlledVehicle,
  buildEjectPassenger,
  buildPlayerVehicleEnter,
  buildRequestVehicleSwitchSeat,
  buildSpellClick,
  NPC_FLAG_PLAYER_VEHICLE,
  NPC_FLAG_SPELLCLICK,
  parseMonsterMoveTransport,
  parsePlayerVehicleData,
} from "#wow/areas/vehicles/protocol";
import { MovementFlag } from "#wow/protocol/entity-fields";
import { buildMoveMessage, parseMovementInfo } from "#wow/protocol/movement";
import { PacketReader } from "#wow/protocol/packet";

const GUID = 0xf1_30_00_3e_ea_00_0a_bcn;
const TRANSPORT = 0xf1_30_00_3e_ea_00_0b_bcn;

describe("parseMonsterMoveTransport", () => {
  test("a move body carries the transport guid and seat (MoveSplineInit.cpp:114-124)", () => {
    const result = parseMonsterMoveTransport(
      new PacketReader(
        vehiclesMonsterMoveTransportBody({
          guid: GUID,
          seat: 2,
          stop: false,
          transportGuid: TRANSPORT,
        }),
      ),
    );
    expect(result.guid).toBe(GUID);
    expect(result.transportGuid).toBe(TRANSPORT);
    expect(result.seat).toBe(2);
    expect(result.move.kind).toBe("move");
    if (result.move.kind !== "move") return;
    expect(result.move.guid).toBe(GUID);
    expect(result.move.splineId).toBe(9);
    expect(result.move.duration).toBe(1000);
  });

  test("a stop body works and seat 0xff reads -1", () => {
    const result = parseMonsterMoveTransport(
      new PacketReader(
        vehiclesMonsterMoveTransportBody({
          guid: GUID,
          seat: -1,
          stop: true,
          transportGuid: TRANSPORT,
        }),
      ),
    );
    expect(result.seat).toBe(-1);
    expect(result.move).toEqual({
      extra: 0,
      guid: GUID,
      kind: "stop",
      splineId: 9,
      start: { x: 1, y: 2, z: 3 },
    });
  });
});

describe("parsePlayerVehicleData", () => {
  test("vehicle id 0 means no longer a vehicle (Unit.cpp:10242-10245,10309-10312)", () => {
    const kept = parsePlayerVehicleData(
      new PacketReader(
        vehiclesPlayerVehicleDataBody({ guid: GUID, vehicleId: 315 }),
      ),
    );
    expect(kept).toEqual({ guid: GUID, vehicleId: 315 });
    const cleared = parsePlayerVehicleData(
      new PacketReader(
        vehiclesPlayerVehicleDataBody({ guid: GUID, vehicleId: 0 }),
      ),
    );
    expect(cleared).toEqual({ guid: GUID, vehicleId: 0 });
  });

  test("vehicle flag constants match the kit bits (Vehicle.cpp:395-397)", () => {
    expect(NPC_FLAG_SPELLCLICK).toBe(0x01_00_00_00);
    expect(NPC_FLAG_PLAYER_VEHICLE).toBe(0x02_00_00_00);
  });
});

describe("seat request builders", () => {
  test("CMSG_SPELLCLICK carries a full u64 guid (SpellHandler.cpp:723-739)", () => {
    const body = buildSpellClick(GUID);
    expect(body.byteLength).toBe(8);
    expect(new PacketReader(body).uint64LE()).toBe(GUID);
  });

  test("CMSG_REQUEST_VEHICLE_SWITCH_SEAT carries a packed guid and int8 seat (VehicleHandler.cpp:122-137)", () => {
    const body = buildRequestVehicleSwitchSeat(TRANSPORT, 2);
    const read = new PacketReader(body);
    expect(read.packedGuidBig()).toBe(TRANSPORT);
    expect(read.uint8()).toBe(2);
    const negative = new PacketReader(
      buildRequestVehicleSwitchSeat(TRANSPORT, -1),
    );
    negative.packedGuidBig();
    expect(negative.uint8()).toBe(0xff);
  });

  test("CMSG_PLAYER_VEHICLE_ENTER carries a full u64 guid (VehicleHandler.cpp:143-163)", () => {
    const body = buildPlayerVehicleEnter(TRANSPORT);
    expect(body.byteLength).toBe(8);
    expect(new PacketReader(body).uint64LE()).toBe(TRANSPORT);
  });

  test("CMSG_CONTROLLER_EJECT_PASSENGER carries a full u64 guid (VehicleHandler.cpp:165-177)", () => {
    const body = buildEjectPassenger(TRANSPORT);
    expect(body.byteLength).toBe(8);
    expect(new PacketReader(body).uint64LE()).toBe(TRANSPORT);
  });
});

describe("controlled vehicle builders", () => {
  const info = {
    extraFlags: 0,
    fallTime: 0,
    flags: MovementFlag.FORWARD,
    orientation: 1.25,
    time: 4242,
    x: 10,
    y: 20,
    z: 30,
  };
  const ACCESSORY = 0xf1_30_00_3e_ea_00_0c_bcn;

  test("CMSG_DISMISS_CONTROLLED_VEHICLE is the packed vehicle guid and its movement info (VehicleHandler.cpp:26-59)", () => {
    const body = buildDismissControlledVehicle(TRANSPORT, info);
    expect(body).toEqual(buildMoveMessage(TRANSPORT, info));
    const read = new PacketReader(body);
    expect(read.packedGuidBig()).toBe(TRANSPORT);
    const parsed = parseMovementInfo(read);
    expect(parsed.x).toBe(10);
    expect(parsed.time).toBe(4242);
    expect(read.remaining).toBe(0);
  });

  test("CMSG_CHANGE_SEATS_ON_CONTROLLED_VEHICLE appends the accessory guid and an int8 seat (VehicleHandler.cpp:89-121)", () => {
    const body = buildChangeSeatsOnControlledVehicle(
      TRANSPORT,
      info,
      ACCESSORY,
      -1,
    );
    const read = new PacketReader(body);
    expect(read.packedGuidBig()).toBe(TRANSPORT);
    parseMovementInfo(read);
    expect(read.packedGuidBig()).toBe(ACCESSORY);
    expect(read.uint8()).toBe(0xff);
    expect(read.remaining).toBe(0);
  });

  test("an accessory of 0 asks for the previous or next seat (VehicleHandler.cpp:109-110)", () => {
    const read = new PacketReader(
      buildChangeSeatsOnControlledVehicle(TRANSPORT, info, 0n, 1),
    );
    read.packedGuidBig();
    parseMovementInfo(read);
    expect(read.packedGuidBig()).toBe(0n);
    expect(read.uint8()).toBe(1);
  });
});
