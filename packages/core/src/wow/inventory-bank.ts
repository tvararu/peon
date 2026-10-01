import type { Entity, EntityLookup } from "#wow/entity-store";
import type {
  InventoryBag,
  InventoryIssue,
  InventoryRegion,
  InventorySlot,
} from "#wow/inventory";
import { PLAYER_FIELDS } from "#wow/protocol/update-fields";

export type RootRange = {
  first: number;
  count: number;
  offset: number;
  region: InventoryRegion;
};

export type InventoryBank = {
  slots: InventorySlot[];
  bags: InventoryBag[];
  issues: InventoryIssue[];
};

export type BankReadContext = {
  selfGuid: bigint;
  getEntity: EntityLookup;
  issues: InventoryIssue[];
  seen: Set<bigint>;
};

export type BankReadFns = {
  roots: (
    context: BankReadContext,
    self: Entity,
    ranges: readonly RootRange[],
  ) => InventorySlot[];
  bag: (
    context: BankReadContext,
    root: InventorySlot,
    slots: InventorySlot[],
    childRegion: InventoryRegion,
  ) => InventoryBag;
};
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

export function readBank(
  selfGuid: bigint,
  self: Entity,
  getEntity: EntityLookup,
  fns: BankReadFns,
): InventoryBank {
  const context: BankReadContext = {
    selfGuid,
    getEntity,
    issues: [],
    seen: new Set(),
  };
  const slots = fns.roots(context, self, BANK_ROOTS);
  const bags: InventoryBag[] = [];
  for (const root of slots.filter(
    (candidate) => candidate.region === "bankbag",
  ))
    bags.push(fns.bag(context, root, slots, "bank_bag_item"));
  return { slots, bags, issues: context.issues };
}
