import { type Entity, ObjectType, type UnitEntity } from "@peon/core";
import type { RefTable } from "#harness/contract/services";

const REF = /^u([1-9]\d*)$/;

export function guidHex(guid: bigint): string {
  return guid.toString(16);
}

export function parseRef(text: string): number | undefined {
  const match = REF.exec(text.trim());
  return match?.[1] ? Number(match[1]) : undefined;
}

export function isUnitEntity(entity: Entity | undefined): entity is UnitEntity {
  return (
    entity?.objectType === ObjectType.UNIT ||
    entity?.objectType === ObjectType.PLAYER
  );
}

export function createRefTable(): RefTable {
  const refs = new Map<bigint, string>();
  const guids = new Map<string, bigint>();
  return {
    guidOf: (ref) => guids.get(ref.trim()),
    refOf(guid) {
      const known = refs.get(guid);
      if (known) return known;
      const ref = `u${refs.size + 1}`;
      refs.set(guid, ref);
      guids.set(ref, guid);
      return ref;
    },
    size: () => refs.size,
  };
}
