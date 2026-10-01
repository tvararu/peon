import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { PLAYER_FIELDS, UNIT_FIELDS } from "#wow/protocol/update-fields";

export const PLAYER_FLAG_GHOST = 0x10;
export const UNIT_FLAG_MOUNT = 0x08_00_00;

export type SelfFields = {
  standState: number | undefined;
  unitFlags: number | undefined;
  mountDisplayId: number | undefined;
  playerFlags: number | undefined;
  selfResSpell: number | undefined;
};

function read(entity: Entity, offset: number): number | undefined {
  return (
    entity.rawFields.get(offset) ?? (entity.createComplete ? 0 : undefined)
  );
}

export function selfFields(
  entity: Entity | undefined,
  selfGuid: bigint,
): SelfFields | undefined {
  if (
    !entity ||
    selfGuid === 0n ||
    entity.guid !== selfGuid ||
    entity.objectType !== ObjectType.PLAYER
  )
    return undefined;
  const bytes1 = read(entity, UNIT_FIELDS.BYTES_1.offset);
  return {
    standState: bytes1 === undefined ? undefined : bytes1 & 0xff,
    unitFlags: read(entity, UNIT_FIELDS.FLAGS.offset),
    mountDisplayId: read(entity, UNIT_FIELDS.MOUNTDISPLAYID.offset),
    playerFlags: read(entity, PLAYER_FIELDS.FLAGS.offset),
    selfResSpell: read(entity, PLAYER_FIELDS.SELF_RES_SPELL.offset),
  };
}
