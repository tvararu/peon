import type { ItemPosition } from "#wow/areas/items/protocol";
import type { InventorySlot, InventoryState } from "#wow/inventory";

export const BACKPACK = 255;
export const NULL_BAG = 0;
export const NULL_SLOT = 255;
export const LAST_EQUIPMENT_SLOT = 18;
export const LAST_BAG_SLOT = 22;
const BANK_FIRST = 39;
const BANK_BAG_FIRST = 67;
const BANK_LAST = 73;
const BUYBACK_FIRST = 74;
const BUYBACK_LAST = 85;

export type MoveKind = "equip" | "equip_slot" | "unequip" | "swap" | "split";
export type MoveTarget = { guid: bigint; count: number };
export type MoveRequest = {
  kind: MoveKind;
  itemGuid: bigint;
  entry: number | undefined;
  from: ItemPosition;
  to: ItemPosition | undefined;
  count: number;
  stackBefore: number;
  target: MoveTarget | undefined;
  requestedAt: number;
};
export type MoveStatus = "confirmed" | "refused" | "no_change" | "unanswered";
export type MoveOutcome = {
  status: MoveStatus;
  reason: string | undefined;
  request: MoveRequest;
  observedAt: number;
};
export type MoveState = {
  pending: MoveRequest | undefined;
  last: MoveOutcome | undefined;
};

export type HeldSlot = Extract<InventorySlot, { status: "occupied" }>;

export function slotAt(
  inventory: InventoryState,
  position: ItemPosition,
): HeldSlot | undefined {
  const found = inventory.slots.find(
    (slot) => slot.bag === position.bag && slot.slot === position.slot,
  );
  return found?.status === "occupied" ? found : undefined;
}

export function findItem(
  inventory: InventoryState,
  guid: bigint,
): HeldSlot | undefined {
  return inventory.slots.find(
    (slot): slot is HeldSlot =>
      slot.status === "occupied" && slot.guid === guid,
  );
}

export function isWorn(position: ItemPosition): boolean {
  return position.bag === BACKPACK && position.slot <= LAST_BAG_SLOT;
}

export function positionRefusal(position: ItemPosition): string | undefined {
  const { bag, slot } = position;
  if (bag >= BANK_BAG_FIRST && bag <= BANK_LAST)
    return `bag ${bag} is a bank bag; bank moves wait for the economy area`;
  if (bag !== BACKPACK) return undefined;
  if (slot >= BANK_FIRST && slot <= BANK_LAST)
    return `slot ${slot} is a bank slot; bank moves wait for the economy area`;
  if (slot >= BUYBACK_FIRST && slot <= BUYBACK_LAST)
    return `slot ${slot} is a buyback slot; buyback moves wait for the economy area`;
  return undefined;
}

const count = (slot: HeldSlot | undefined) => slot?.item.count ?? 1;
const same = (slot: HeldSlot | undefined, position: ItemPosition | undefined) =>
  slot !== undefined &&
  position !== undefined &&
  slot.bag === position.bag &&
  slot.slot === position.slot;

function unequipped(request: MoveRequest, held: HeldSlot | undefined): boolean {
  if (!held || (held.region !== "backpack" && held.region !== "bag_item"))
    return false;
  const bag = request.to?.bag ?? NULL_BAG;
  return bag === NULL_BAG || held.bag === bag;
}

function swapped(request: MoveRequest, inventory: InventoryState): boolean {
  if (same(findItem(inventory, request.itemGuid), request.to)) return true;
  const target = request.target;
  if (!(target && request.to) || target.guid === request.itemGuid) return false;
  const there = slotAt(inventory, request.to);
  return there?.guid === target.guid && count(there) > target.count;
}

function split(request: MoveRequest, inventory: InventoryState): boolean {
  const source = slotAt(inventory, request.from);
  if (source?.guid !== request.itemGuid) return false;
  if (count(source) !== request.stackBefore - request.count) return false;
  const there = request.to && slotAt(inventory, request.to);
  return there !== undefined && there.item.entry === request.entry;
}

const RULES: Readonly<
  Record<
    MoveKind,
    (
      request: MoveRequest,
      inventory: InventoryState,
      held: HeldSlot | undefined,
    ) => boolean
  >
> = {
  equip: (_request, _inventory, held) => held !== undefined && isWorn(held),
  equip_slot: (request, _inventory, held) => same(held, request.to),
  unequip: (request, _inventory, held) => unequipped(request, held),
  swap: (request, inventory) => swapped(request, inventory),
  split: (request, inventory) => split(request, inventory),
};

export function moveSettled(
  request: MoveRequest,
  inventory: InventoryState,
): boolean {
  const held = findItem(inventory, request.itemGuid);
  return RULES[request.kind](request, inventory, held);
}
