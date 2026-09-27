import {
  type Entity,
  type EntityLookup,
  fieldOf,
  isUnit,
  UNIT_FIELDS,
  UnitFlag,
} from "@peon/core";

const DYNFLAG_TAPPED = 0x4;
const DYNFLAG_TAPPED_BY_PLAYER = 0x8;
const HIGH_GUID_SHIFT = 48n;

export function tappedByOther(entity: Entity): boolean {
  const flags = fieldOf(entity, UNIT_FIELDS.DYNAMIC_FLAGS.offset) ?? 0;
  return (flags & DYNFLAG_TAPPED) !== 0 && !(flags & DYNFLAG_TAPPED_BY_PLAYER);
}

export function vetTarget(
  entity: EntityLookup,
  selfGuid: bigint,
  guid: bigint,
): string | undefined {
  const unit = entity(guid);
  if (unit === undefined) return "target_unobserved";
  if (!isUnit(unit)) return undefined;
  if (unit.health === 0) return "target_dead";
  if (tappedByOther(unit)) return "tapped_by_other";
  const target = unit.target;
  if (
    (unit.unitFlags & UnitFlag.IN_COMBAT) !== 0 &&
    target !== 0n &&
    target !== selfGuid &&
    target >> HIGH_GUID_SHIFT === 0n
  )
    return "engaged_by_other";
  return undefined;
}
