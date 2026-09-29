import { type Entity, ObjectType, type UnitEntity } from "@peon/core";
import type { RefTable } from "#harness/contract/services";

const REF = /^[uo]([1-9]\d*)$/;

const HIGH_GUID_SHIFT = 0x1_0000_0000_0000n;

const OBJECT_HIGH: Record<number, true> = {
  8128: true,
  61712: true,
  61728: true,
};

export function isObjectGuid(guid: bigint): boolean {
  return OBJECT_HIGH[Number(guid / HIGH_GUID_SHIFT)] === true;
}

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
      const prefix = isObjectGuid(guid) ? "o" : "u";
      let next = 1;
      while (guids.has(`${prefix}${next}`)) next += 1;
      const ref = `${prefix}${next}`;
      refs.set(guid, ref);
      guids.set(ref, guid);
      return ref;
    },
    size: () => refs.size,
  };
}
