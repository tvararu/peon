import {
  writePackedGuid,
  writeUpdateMask,
} from "#test-support/world-handlers-fixtures";
import { UpdateFlag, UpdateType } from "#wow/protocol/entity-fields";
import { PacketWriter } from "#wow/protocol/packet";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";

export function vehiclesMonsterMoveTransportBody(init: {
  guid: bigint;
  transportGuid: bigint;
  seat: number;
  stop: boolean;
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.guid);
  w.packedGuidBig(init.transportGuid);
  w.uint8(init.seat & 0xff);
  w.uint8(0);
  w.floatLE(1);
  w.floatLE(2);
  w.floatLE(3);
  w.uint32LE(9);
  if (init.stop) {
    w.uint8(1);
    return w.finish();
  }
  w.uint8(0);
  w.uint32LE(0);
  w.uint32LE(1000);
  w.uint32LE(1);
  w.floatLE(10);
  w.floatLE(0);
  w.floatLE(0);
  return w.finish();
}

export function vehiclesPlayerVehicleDataBody(init: {
  guid: bigint;
  vehicleId: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.guid);
  w.uint32LE(init.vehicleId);
  return w.finish();
}

export function vehiclesCreateVehicleBlock(init: {
  guid: bigint;
  vehicleId: number;
  orientation: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(1);
  w.uint8(UpdateType.CREATE_OBJECT2);
  writePackedGuid(w, init.guid);
  w.uint8(3);
  w.uint16LE(UpdateFlag.HAS_POSITION | UpdateFlag.VEHICLE);
  w.floatLE(5);
  w.floatLE(6);
  w.floatLE(7);
  w.floatLE(1);
  w.uint32LE(init.vehicleId);
  w.floatLE(init.orientation);
  writeUpdateMask(w, new Map([[UNIT_FIELDS.HEALTH.offset, 100]]));
  return w.finish();
}
