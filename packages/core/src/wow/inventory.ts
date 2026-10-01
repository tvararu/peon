import { type Entity, type EntityLookup, fieldOf } from "#wow/entity-store";
import { BANK_ROOTS } from "#wow/inventory-bank";
import { readSelfField } from "#wow/player-state";
import { ObjectType } from "#wow/protocol/entity-fields";
import { joinGuid } from "#wow/protocol/packet";
import {
  CONTAINER_FIELDS,
  ITEM_FIELDS,
  OBJECT_FIELDS,
  PLAYER_FIELDS,
} from "#wow/protocol/update-fields";

export type InventoryItem = {
  guid: bigint;
  entry: number | undefined;
  owner: bigint | undefined;
  contained: bigint | undefined;
  count: number | undefined;
  flags: number | undefined;
  randomPropertyId: number | undefined;
  durability: number | undefined;
  maxDurability: number | undefined;
  duration?: number | undefined;
  spellCharges?: number[] | undefined;
  enchantments?: ItemEnchantment[] | undefined;
  creator?: bigint | undefined;
  giftCreator?: bigint | undefined;
  flagBits?: ItemFlagBits | undefined;
};

export type ItemEnchantment = {
  slot: number;
  id: number;
  duration: number;
  charges: number;
};

export type ItemFlagBits = {
  soulbound: boolean;
  wrapped: boolean;
  readable: boolean;
  refundable: boolean;
};

export type InventoryRegion =
  | "equipment"
  | "bag"
  | "backpack"
  | "keyring"
  | "currency"
  | "bag_item"
  | "buyback"
  | "bank"
  | "bankbag";
export type InventoryAddress = {
  bag: number;
  slot: number;
  region: InventoryRegion;
};
export type InventorySlot = InventoryAddress &
  (
    | { status: "unknown" }
    | { status: "empty" }
    | { status: "occupied"; guid: bigint; item: InventoryItem }
  );
export type BuybackSlot = InventoryAddress & {
  region: "buyback";
  guid: bigint;
  price: number | undefined;
  soldAt: number | undefined;
};
export type InventoryBag = {
  slot: number;
  guid: bigint | undefined;
  status: "unknown" | "empty" | "known";
  size: number | undefined;
};
export type InventoryIssue = {
  code:
    | "owner_mismatch"
    | "contained_mismatch"
    | "duplicate_guid"
    | "invalid_item_type"
    | "invalid_bag_type"
    | "invalid_bag_size";
  bag: number;
  slot: number;
  guid: bigint;
};
export type InventoryState = {
  selfGuid: bigint;
  scope: "carried";
  status: "unknown" | "partial" | "complete";
  coinage: number | undefined;
  slots: InventorySlot[];
  bags: InventoryBag[];
  freeSlots: number | undefined;
  issues: InventoryIssue[];
  buyback?: BuybackSlot[] | undefined;
  ammoId?: number | undefined;
};

type ReadContext = {
  selfGuid: bigint;
  getEntity: EntityLookup;
  issues: InventoryIssue[];
  seen: Set<bigint>;
};

const ROOTS = [
  {
    first: 0,
    count: 19,
    offset: PLAYER_FIELDS.INV_SLOT_HEAD.offset,
    region: "equipment",
  },
  {
    first: 19,
    count: 4,
    offset: PLAYER_FIELDS.INV_SLOT_HEAD.offset + 38,
    region: "bag",
  },
  {
    first: 23,
    count: 16,
    offset: PLAYER_FIELDS.PACK_SLOT_1.offset,
    region: "backpack",
  },
  {
    first: 86,
    count: 32,
    offset: PLAYER_FIELDS.KEYRING_SLOT_1.offset,
    region: "keyring",
  },
  {
    first: 118,
    count: 32,
    offset: PLAYER_FIELDS.CURRENCYTOKEN_SLOT_1.offset,
    region: "currency",
  },
  ...BANK_ROOTS,
] as const;

const BUYBACK = { first: 74, count: 12 } as const;

function guid(
  low: number | undefined,
  high: number | undefined,
): bigint | undefined {
  if (low === undefined || high === undefined) return undefined;
  return joinGuid(low, high);
}

function itemGuid(entity: Entity, offset: number): bigint | undefined {
  return guid(fieldOf(entity, offset), fieldOf(entity, offset + 1));
}

const ENCHANTMENT_SLOTS = 12;
const ENCHANTMENT_STRIDE = 3;

const ITEM_FLAG = {
  SOULBOUND: 0x1,
  WRAPPED: 0x8,
  READABLE: 0x2_00,
  REFUNDABLE: 0x10_00,
} as const;

function flagBits(flags: number | undefined): ItemFlagBits | undefined {
  if (flags === undefined) return undefined;
  return {
    soulbound: (flags & ITEM_FLAG.SOULBOUND) !== 0,
    wrapped: (flags & ITEM_FLAG.WRAPPED) !== 0,
    readable: (flags & ITEM_FLAG.READABLE) !== 0,
    refundable: (flags & ITEM_FLAG.REFUNDABLE) !== 0,
  };
}

function spellCharges(entity: Entity): number[] | undefined {
  const charges: number[] = [];
  for (let i = 0; i < ITEM_FIELDS.SPELL_CHARGES.size; i++) {
    const value = fieldOf(entity, ITEM_FIELDS.SPELL_CHARGES.offset + i);
    if (value === undefined) return undefined;
    charges.push(value | 0);
  }
  return charges;
}

function enchantments(entity: Entity): ItemEnchantment[] | undefined {
  const result: ItemEnchantment[] = [];
  for (let index = 0; index < ENCHANTMENT_SLOTS; index++) {
    const base =
      ITEM_FIELDS.ENCHANTMENT_1_1.offset + index * ENCHANTMENT_STRIDE;
    const id = fieldOf(entity, base);
    const duration = fieldOf(entity, base + 1);
    const charges = fieldOf(entity, base + 2);
    if (id === undefined || duration === undefined || charges === undefined)
      return undefined;
    if (id !== 0) result.push({ slot: index, id, duration, charges });
  }
  return result;
}

type ItemDetails = Pick<
  InventoryItem,
  | "duration"
  | "spellCharges"
  | "enchantments"
  | "creator"
  | "giftCreator"
  | "flagBits"
>;

function details(entity: Entity | undefined, owned: boolean): ItemDetails {
  if (!entity) return { flagBits: undefined };
  const mine = owned ? entity : undefined;
  return {
    duration: fieldOf(mine, ITEM_FIELDS.DURATION.offset),
    spellCharges: mine && spellCharges(mine),
    enchantments: mine && enchantments(mine),
    creator: itemGuid(entity, ITEM_FIELDS.CREATOR.offset),
    giftCreator: itemGuid(entity, ITEM_FIELDS.GIFTCREATOR.offset),
    flagBits: flagBits(fieldOf(entity, ITEM_FIELDS.FLAGS.offset)),
  };
}

function issue(
  context: ReadContext,
  address: InventoryAddress,
  itemId: bigint,
  code: InventoryIssue["code"],
): void {
  context.issues.push({
    code,
    bag: address.bag,
    slot: address.slot,
    guid: itemId,
  });
}

function readItem(
  context: ReadContext,
  address: InventoryAddress,
  itemId: bigint,
  parent: bigint,
): InventoryItem {
  let entity = context.getEntity(itemId);
  if (
    entity &&
    (entity.guid !== itemId ||
      (entity.objectType !== ObjectType.ITEM &&
        entity.objectType !== ObjectType.CONTAINER))
  ) {
    issue(context, address, itemId, "invalid_item_type");
    entity = undefined;
  }
  const owner = entity ? itemGuid(entity, ITEM_FIELDS.OWNER.offset) : undefined;
  const contained = entity
    ? itemGuid(entity, ITEM_FIELDS.CONTAINED.offset)
    : undefined;
  if (owner !== undefined && owner !== context.selfGuid)
    issue(context, address, itemId, "owner_mismatch");
  if (contained !== undefined && contained !== parent)
    issue(context, address, itemId, "contained_mismatch");
  const owned = owner === context.selfGuid && contained === parent;
  const property = fieldOf(entity, ITEM_FIELDS.RANDOM_PROPERTIES_ID.offset);
  return {
    guid: itemId,
    owner,
    contained,
    entry: fieldOf(entity, OBJECT_FIELDS.ENTRY.offset),
    count: owned ? fieldOf(entity, ITEM_FIELDS.STACK_COUNT.offset) : undefined,
    flags: fieldOf(entity, ITEM_FIELDS.FLAGS.offset),
    randomPropertyId: property === undefined ? undefined : property | 0,
    durability: owned
      ? fieldOf(entity, ITEM_FIELDS.DURABILITY.offset)
      : undefined,
    maxDurability: owned
      ? fieldOf(entity, ITEM_FIELDS.MAXDURABILITY.offset)
      : undefined,
    ...details(entity, owned),
  };
}

function slot(
  context: ReadContext,
  address: InventoryAddress,
  itemId: bigint | undefined,
  parent: bigint,
): InventorySlot {
  if (itemId === undefined) return { ...address, status: "unknown" };
  if (itemId === 0n) return { ...address, status: "empty" };
  if (context.seen.has(itemId))
    issue(context, address, itemId, "duplicate_guid");
  context.seen.add(itemId);
  return {
    ...address,
    status: "occupied",
    guid: itemId,
    item: readItem(context, address, itemId, parent),
  };
}

function roots(context: ReadContext, self: Entity): InventorySlot[] {
  const result: InventorySlot[] = [];
  for (const range of ROOTS) {
    for (let i = 0; i < range.count; i++) {
      const offset = range.offset + i * 2;
      const rootGuid = guid(
        readSelfField(context.selfGuid, self, offset),
        readSelfField(context.selfGuid, self, offset + 1),
      );
      result.push(
        slot(
          context,
          { bag: 255, slot: range.first + i, region: range.region },
          rootGuid,
          context.selfGuid,
        ),
      );
    }
  }
  return result;
}

function buyback(self: Entity): BuybackSlot[] {
  const read = (offset: number) => fieldOf(self, offset);
  const result: BuybackSlot[] = [];
  for (let i = 0; i < BUYBACK.count; i++) {
    const offset = PLAYER_FIELDS.FIELD_INV.offset + (BUYBACK.first + i) * 2;
    const held = guid(read(offset), read(offset + 1));
    if (!held) continue;
    result.push({
      bag: 255,
      slot: BUYBACK.first + i,
      region: "buyback",
      guid: held,
      price: read(PLAYER_FIELDS.BUYBACK_PRICE_1.offset + i),
      soldAt: read(PLAYER_FIELDS.BUYBACK_TIMESTAMP_1.offset + i),
    });
  }
  return result;
}

function bag(
  context: ReadContext,
  root: InventorySlot,
  slots: InventorySlot[],
): InventoryBag {
  if (root.status === "empty")
    return { slot: root.slot, guid: 0n, status: "empty", size: 0 };
  const result: InventoryBag = {
    slot: root.slot,
    guid: root.status === "occupied" ? root.guid : undefined,
    status: "unknown",
    size: undefined,
  };
  if (root.status !== "occupied") return result;
  if (
    context.issues.some(
      (recorded) =>
        recorded.code === "duplicate_guid" && recorded.guid === root.guid,
    )
  )
    return result;
  const entity = context.getEntity(root.guid);
  if (
    !entity ||
    root.item.owner !== context.selfGuid ||
    root.item.contained !== context.selfGuid
  )
    return result;
  if (entity.guid !== root.guid || entity.objectType !== ObjectType.CONTAINER) {
    issue(context, root, root.guid, "invalid_bag_type");
    return result;
  }
  const size = fieldOf(entity, CONTAINER_FIELDS.NUM_SLOTS.offset);
  if (size === undefined) return result;
  if (size > CONTAINER_FIELDS.SLOT_1.size / 2) {
    issue(context, root, root.guid, "invalid_bag_size");
    return result;
  }
  result.status = "known";
  result.size = size;
  for (let i = 0; i < size; i++) {
    const child = itemGuid(entity, CONTAINER_FIELDS.SLOT_1.offset + i * 2);
    slots.push(
      slot(
        context,
        { bag: root.slot, slot: i, region: "bag_item" },
        child,
        root.guid,
      ),
    );
  }
  return result;
}

function isBankRegion(region: InventoryRegion): boolean {
  return region === "bank" || region === "bankbag";
}

function complete(candidate: InventorySlot): boolean {
  if (candidate.status === "unknown") return false;
  if (candidate.status === "empty") return true;
  const item = candidate.item;
  return (
    item.entry !== undefined &&
    item.owner !== undefined &&
    item.contained !== undefined &&
    item.count !== undefined &&
    item.flags !== undefined &&
    item.randomPropertyId !== undefined &&
    item.durability !== undefined &&
    item.maxDurability !== undefined
  );
}

function freeSlots(
  slots: InventorySlot[],
  bags: InventoryBag[],
  issues: InventoryIssue[],
): number | undefined {
  if (issues.some((recorded) => recorded.code === "duplicate_guid"))
    return undefined;
  if (bags.some((bagState) => bagState.size === undefined)) return undefined;
  let count = 0;
  for (const candidate of slots) {
    if (candidate.region !== "backpack" && candidate.region !== "bag_item")
      continue;
    if (candidate.status === "unknown") return undefined;
    if (candidate.status === "empty") count++;
  }
  return count;
}

export function readInventory(
  selfGuid: bigint,
  getEntity: EntityLookup,
): InventoryState {
  const self = getEntity(selfGuid);
  if (
    !selfGuid ||
    self?.guid !== selfGuid ||
    self.objectType !== ObjectType.PLAYER
  )
    return {
      selfGuid,
      scope: "carried",
      status: "unknown",
      coinage: undefined,
      slots: [],
      bags: [],
      freeSlots: undefined,
      issues: [],
      buyback: [],
      ammoId: undefined,
    };
  const context: ReadContext = {
    selfGuid,
    getEntity,
    issues: [],
    seen: new Set(),
  };
  const slots = roots(context, self);
  const bags: InventoryBag[] = [];
  for (const root of slots.filter((candidate) => candidate.region === "bag"))
    bags.push(bag(context, root, slots));
  const coinage = readSelfField(selfGuid, self, PLAYER_FIELDS.COINAGE.offset);
  const known =
    coinage !== undefined &&
    context.issues.length === 0 &&
    slots
      .filter((candidate) => !isBankRegion(candidate.region))
      .every(complete) &&
    bags.every((bagState) => bagState.size !== undefined);
  return {
    selfGuid,
    scope: "carried",
    status: known ? "complete" : "partial",
    coinage,
    slots,
    bags,
    freeSlots: freeSlots(slots, bags, context.issues),
    issues: context.issues,
    buyback: buyback(self),
    ammoId: fieldOf(self, PLAYER_FIELDS.AMMO_ID.offset),
  };
}
