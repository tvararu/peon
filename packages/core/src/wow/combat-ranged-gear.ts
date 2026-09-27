import { type EntityLookup, fieldOf } from "#wow/entity-store";
import { type InventorySlot, readInventory } from "#wow/inventory";
import type { ItemLabel } from "#wow/item-labels";
import { PLAYER_FIELDS } from "#wow/protocol/update-fields";

export type RangedItem = {
  entry: number;
  itemClass: number | undefined;
  subclass: number | undefined;
};

export type RangedGear = {
  weapon: RangedItem | null | undefined;
  ammo: (RangedItem & { count: number }) | null | undefined;
};

const EQUIPMENT_SLOT_RANGED = 17;
const AMMO_REGIONS = new Set(["backpack", "bag_item"]);

function rangedItem(
  entry: number,
  label: (entry: number) => ItemLabel,
): RangedItem {
  const { itemClass, subclass } = label(entry);
  return { entry, itemClass, subclass };
}

function slotItem(
  slot: InventorySlot | undefined,
  label: (entry: number) => ItemLabel,
): RangedItem | null | undefined {
  if (slot?.status === "empty") return null;
  if (slot?.status !== "occupied" || slot.item.entry === undefined)
    return undefined;
  return rangedItem(slot.item.entry, label);
}

export function readRangedGear(
  selfGuid: bigint,
  getEntity: EntityLookup,
  label: (entry: number) => ItemLabel,
): RangedGear {
  const inventory = readInventory(selfGuid, getEntity);
  if (inventory.status === "unknown")
    return { weapon: undefined, ammo: undefined };
  const slot = inventory.slots.find(
    (entry) =>
      entry.region === "equipment" && entry.slot === EQUIPMENT_SLOT_RANGED,
  );
  const weapon = slotItem(slot, label);
  const ammoId = fieldOf(getEntity(selfGuid), PLAYER_FIELDS.AMMO_ID.offset);
  if (ammoId === undefined) return { weapon, ammo: undefined };
  if (ammoId === 0) return { weapon, ammo: null };
  let count = 0;
  for (const entry of inventory.slots)
    if (
      AMMO_REGIONS.has(entry.region) &&
      entry.status === "occupied" &&
      entry.item.entry === ammoId
    )
      count += entry.item.count ?? 0;
  return { weapon, ammo: { ...rangedItem(ammoId, label), count } };
}
