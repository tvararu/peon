import {
  writePackedGuid,
  writeUpdateMask,
} from "#test-support/world-handlers-fixtures";
import {
  ObjectType,
  UpdateFlag,
  UpdateType,
} from "#wow/protocol/entity-fields";
import { type MovementInfo, writeMovementInfo } from "#wow/protocol/movement";
import { PacketWriter } from "#wow/protocol/packet";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";

export const BASE_CREATE_SPEEDS = [
  2.5, 7, 4.5, 4.722_222, 2.5, 7, 4.5, 3.141_594, 3.14,
] as const;

export function unitmotionSplineSpeedBody(init: {
  guid: bigint;
  speed: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.guid);
  w.floatLE(init.speed);
  return w.finish();
}

export function unitmotionSplineToggleBody(init: { guid: bigint }): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.guid);
  return w.finish();
}

export function unitmotionMovementInfo(flags = 0): MovementInfo {
  return {
    extraFlags: 0,
    fallTime: 0,
    flags,
    orientation: 0,
    time: 77,
    x: 1,
    y: 2,
    z: 3,
  };
}

export function unitmotionLivingBlock(
  w: PacketWriter,
  init: { flags?: number; speeds?: readonly number[] } = {},
): PacketWriter {
  w.uint16LE(UpdateFlag.LIVING);
  writeMovementInfo(w, unitmotionMovementInfo(init.flags));
  for (const speed of init.speeds ?? BASE_CREATE_SPEEDS) w.floatLE(speed);
  return w;
}

export function unitmotionCreateBody(init: {
  guid: bigint;
  objectType?: ObjectType;
  flags?: number;
  speeds?: readonly number[];
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(1);
  w.uint8(UpdateType.CREATE_OBJECT2);
  writePackedGuid(w, init.guid);
  w.uint8(init.objectType ?? ObjectType.UNIT);
  unitmotionLivingBlock(w, init);
  writeUpdateMask(
    w,
    new Map([
      [UNIT_FIELDS.HEALTH.offset, 100],
      [UNIT_FIELDS.MAXHEALTH.offset, 100],
    ]),
  );
  return w.finish();
}
