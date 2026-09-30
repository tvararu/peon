import { describe, expect, test } from "bun:test";
import {
  vehiclesMonsterMoveTransportBody,
  vehiclesPlayerVehicleDataBody,
} from "#test-support/areas/vehicles";
import {
  NPC_FLAG_PLAYER_VEHICLE,
  NPC_FLAG_SPELLCLICK,
  parseMonsterMoveTransport,
  parsePlayerVehicleData,
} from "#wow/areas/vehicles/protocol";
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
