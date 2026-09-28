import { slotAt } from "#wow/areas/items/moves";
import type { InventoryState } from "#wow/inventory";
import type { ItemTemplate } from "#wow/protocol/item";

const BAG_SLOTS = [19, 20, 21, 22];

const SLOTS_BY_TYPE: Readonly<Record<number, readonly number[]>> = {
  1: [0],
  2: [1],
  3: [2],
  4: [3],
  5: [4],
  6: [5],
  7: [6],
  8: [7],
  9: [8],
  10: [9],
  11: [10, 11],
  12: [12, 13],
  13: [15],
  14: [16],
  15: [17],
  16: [14],
  17: [15],
  18: BAG_SLOTS,
  19: [18],
  20: [4],
  21: [15],
  22: [16],
  23: [16],
  25: [17],
  26: [17],
  28: [17],
};

export function equipSlots(inventoryType: number): readonly number[] {
  return SLOTS_BY_TYPE[inventoryType] ?? [];
}

type Lookup = (entry: number) => Promise<ItemTemplate | undefined>;

async function levelAt(
  inventory: InventoryState,
  slot: number,
  lookup: Lookup,
): Promise<number | undefined> {
  const held = slotAt(inventory, { bag: 255, slot });
  if (!held) return 0;
  const entry = held.item.entry;
  if (entry === undefined) return undefined;
  const template = await lookup(entry).catch(() => undefined);
  return template?.itemLevel;
}

export async function wornItemLevel(
  inventory: InventoryState,
  inventoryType: number,
  lookup: Lookup,
): Promise<number | undefined> {
  const slots = equipSlots(inventoryType);
  if (slots.length === 0) return undefined;
  const levels = await Promise.all(
    slots.map((slot) => levelAt(inventory, slot, lookup)),
  );
  const known = levels.filter((level): level is number => level !== undefined);
  return known.length === levels.length ? Math.min(...known) : undefined;
}
