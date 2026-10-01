import type { EntityLookup } from "#wow/entity-store";
import { PLAYER_FIELDS } from "#wow/protocol/update-fields";
export const BANK_FIELD_RANGE = {
  offset: PLAYER_FIELDS.INV_SLOT_HEAD.offset + 78,
  size: 70,
} as const;

export const BANK_ROOTS = [
  {
    count: 28,
    first: 39,
    offset: PLAYER_FIELDS.INV_SLOT_HEAD.offset + 78,
    region: "bank",
  },
  {
    count: 7,
    first: 67,
    offset: PLAYER_FIELDS.INV_SLOT_HEAD.offset + 134,
    region: "bankbag",
  },
] as const;

export function readBankBagSlots(
  selfGuid: bigint,
  getEntity: EntityLookup,
): number | undefined {
  const value = getEntity(selfGuid)?.rawFields.get(
    PLAYER_FIELDS.BYTES_2.offset,
  );
  if (value === undefined) return undefined;
  return (value >>> 16) & 0xff;
}
