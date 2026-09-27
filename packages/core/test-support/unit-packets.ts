import { must } from "#test-support/must";
import {
  ObjectType,
  UpdateFlag,
  UpdateType,
} from "#wow/protocol/entity-fields";
import { writeMovementInfo } from "#wow/protocol/movement";
import { PacketWriter } from "#wow/protocol/packet";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";

function writeFields(writer: PacketWriter, fields: Map<number, number>): void {
  const sorted = [...fields.entries()].sort(([a], [b]) => a - b);
  const blocks = Math.floor(must(sorted.at(-1))[0] / 32) + 1;
  const masks = new Array<number>(blocks).fill(0);
  for (const [offset] of sorted) {
    const slot = Math.floor(offset / 32);
    masks[slot] = must(masks[slot]) | (1 << (offset % 32));
  }
  writer.uint8(blocks);
  for (const mask of masks) writer.uint32LE(mask);
  for (const [, value] of sorted) writer.uint32LE(value);
}

function writeUnit(
  writer: PacketWriter,
  guid: number,
  x: number,
  selfGuid: number,
): void {
  const self = guid === selfGuid;
  writer.uint8(UpdateType.CREATE_OBJECT2);
  writer.packedGuid(guid, 0);
  writer.uint8(self ? ObjectType.PLAYER : ObjectType.UNIT);
  writer.uint16LE(UpdateFlag.LIVING | (self ? UpdateFlag.SELF : 0));
  writeMovementInfo(writer, {
    extraFlags: 0,
    fallTime: 0,
    flags: 0,
    orientation: 0,
    time: 1,
    x,
    y: 2,
    z: 3,
  });
  for (const speed of [2.5, 7, 4.5, 4.7, 2.5, 3.14, 7, 4.5, 3.14])
    writer.floatLE(speed);
  writeFields(
    writer,
    new Map([
      [UNIT_FIELDS.HEALTH.offset, 100],
      [UNIT_FIELDS.MAXHEALTH.offset, 100],
      [UNIT_FIELDS.FLAGS.offset, self ? 0 : 0x8_00_00],
      [UNIT_FIELDS.TARGET.offset, self ? 0 : selfGuid],
      [UNIT_FIELDS.COMBATREACH.offset, 0x3f_c0_00_00],
    ]),
  );
}

export function unitsPacket(
  selfGuid: number,
  targetGuid: number,
  targetX: number,
): Uint8Array {
  const writer = new PacketWriter();
  writer.uint32LE(2);
  writeUnit(writer, selfGuid, 1, selfGuid);
  writeUnit(writer, targetGuid, targetX, selfGuid);
  return writer.finish();
}
