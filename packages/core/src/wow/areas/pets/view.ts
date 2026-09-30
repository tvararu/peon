import type { EntityLookup } from "#wow/entity-store";
import { joinGuid } from "#wow/protocol/packet";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";

const CAN_RENAME = 0x01;
const CAN_ABANDON = 0x02;

export type PetView = {
  guid: bigint;
  number: number;
  nameTimestamp: number;
  canRename: boolean;
  canAbandon: boolean;
  happiness: number;
  health: number;
  maxHealth: number;
};

export function petView(
  getEntity: EntityLookup,
  selfGuid: bigint,
): PetView | undefined {
  const owner = getEntity(selfGuid)?.rawFields;
  const low = owner?.get(UNIT_FIELDS.SUMMON.offset) ?? 0;
  const high = owner?.get(UNIT_FIELDS.SUMMON.offset + 1) ?? 0;
  const guid = joinGuid(low, high);
  if (guid === 0n) return undefined;
  const fields = getEntity(guid)?.rawFields;
  if (!fields) return undefined;
  const rename = ((fields.get(UNIT_FIELDS.BYTES_2.offset) ?? 0) >>> 16) & 0xff;
  return {
    guid,
    number: fields.get(UNIT_FIELDS.PETNUMBER.offset) ?? 0,
    nameTimestamp: fields.get(UNIT_FIELDS.PET_NAME_TIMESTAMP.offset) ?? 0,
    canRename: (rename & CAN_RENAME) !== 0,
    canAbandon: (rename & CAN_ABANDON) !== 0,
    happiness: fields.get(UNIT_FIELDS.POWER5.offset) ?? 0,
    health: fields.get(UNIT_FIELDS.HEALTH.offset) ?? 0,
    maxHealth: fields.get(UNIT_FIELDS.MAXHEALTH.offset) ?? 0,
  };
}
