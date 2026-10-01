import {
  writePackedGuid,
  writeUpdateMask,
} from "#test-support/world-handlers-fixtures";
import {
  MovementFlag,
  UpdateFlag,
  UpdateType,
} from "#wow/protocol/entity-fields";
import { writeMovementInfo } from "#wow/protocol/movement";
import { PacketWriter } from "#wow/protocol/packet";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";

type MoveInit = {
  stop: boolean;
  flags?: number;
  splineId?: number;
  duration?: number;
};

function writeMoveTail(w: PacketWriter, init: MoveInit): void {
  w.uint8(0);
  w.floatLE(1);
  w.floatLE(2);
  w.floatLE(3);
  w.uint32LE(init.splineId ?? 9);
  if (init.stop) {
    w.uint8(1);
    return;
  }
  w.uint8(0);
  w.uint32LE(init.flags ?? 0);
  w.uint32LE(init.duration ?? 1000);
  w.uint32LE(1);
  w.floatLE(10);
  w.floatLE(0);
  w.floatLE(0);
}

export function vehiclesMonsterMoveTransportBody(
  init: MoveInit & { guid: bigint; transportGuid: bigint; seat: number },
): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.guid);
  w.packedGuidBig(init.transportGuid);
  w.uint8(init.seat & 0xff);
  writeMoveTail(w, init);
  return w.finish();
}

export function vehiclesMonsterMoveBody(
  init: MoveInit & { guid: bigint },
): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.guid);
  writeMoveTail(w, init);
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
  w.uint16LE(UpdateFlag.LIVING | UpdateFlag.VEHICLE);
  w.uint32LE(0);
  w.uint16LE(0);
  w.uint32LE(0);
  w.floatLE(5);
  w.floatLE(6);
  w.floatLE(7);
  w.floatLE(init.orientation);
  w.floatLE(0);
  for (let i = 0; i < 9; i++) w.floatLE(i === 1 ? 7 : 0);
  w.uint32LE(init.vehicleId);
  w.floatLE(init.orientation);
  writeUpdateMask(w, new Map([[UNIT_FIELDS.HEALTH.offset, 100]]));
  return w.finish();
}

export function vehiclesCreateSelfOnTransportBlock(init: {
  guid: bigint;
  transportGuid: bigint;
  seat: number;
  offset: { x: number; y: number; z: number };
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(1);
  w.uint8(UpdateType.CREATE_OBJECT2);
  writePackedGuid(w, init.guid);
  w.uint8(4);
  w.uint16LE(UpdateFlag.SELF | UpdateFlag.LIVING);
  writeMovementInfo(w, {
    extraFlags: 0,
    fallTime: 0,
    flags: MovementFlag.ON_TRANSPORT,
    orientation: 0,
    time: 0,
    transport: {
      guid: init.transportGuid,
      orientation: 0,
      seat: init.seat,
      time: 0,
      ...init.offset,
    },
    x: 5,
    y: 6,
    z: 7,
  });
  for (let i = 0; i < 9; i++) w.floatLE(i === 1 ? 7 : 0);
  writeUpdateMask(w, new Map([[UNIT_FIELDS.HEALTH.offset, 100]]));
  return w.finish();
}
