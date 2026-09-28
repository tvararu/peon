import {
  CLASS_NAMES,
  type ItemTemplate,
  itemKind,
  type NamedInventorySlot,
  type NamedInventoryState,
} from "@peon/core";
import type { BagRow } from "#harness/contract/details";

type Occupied = Extract<NamedInventorySlot, { status: "occupied" }>;

const SLOTS_BY_TYPE: Record<number, readonly number[]> = {
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
  18: [19, 20, 21, 22],
  19: [18],
  20: [4],
  21: [15],
  22: [16],
  23: [16],
  25: [17],
  26: [17],
  28: [17],
};

export type BagMarkCtx = {
  inventory: NamedInventoryState;
  templates: Record<number, ItemTemplate | undefined>;
  playerClass: string | undefined;
  playerLevel: number | undefined;
};

export function bagItemName(slot: Occupied): string {
  return slot.item.name ?? `item ${slot.item.entry ?? 0}`;
}

function classId(name: string | undefined): number | undefined {
  if (name === undefined) return undefined;
  for (const [id, label] of Object.entries(CLASS_NAMES))
    if (label === name) return Number(id);
  return undefined;
}

function heldAt(
  inventory: NamedInventoryState,
  regions: readonly string[],
  slot: number,
): Occupied | undefined {
  return inventory.slots.find(
    (candidate): candidate is Occupied =>
      candidate.status === "occupied" &&
      regions.includes(candidate.region) &&
      candidate.bag === 255 &&
      candidate.slot === slot,
  );
}

function wornLevel(
  mark: BagMarkCtx,
  inventoryType: number,
): number | undefined {
  const slots = SLOTS_BY_TYPE[inventoryType] ?? [];
  if (slots.length === 0) return undefined;
  const levels: number[] = [];
  for (const slot of slots) {
    const held = heldAt(mark.inventory, ["equipment", "bag"], slot);
    if (!held) continue;
    const entry = held.item.entry;
    const heldTemplate =
      entry === undefined ? undefined : mark.templates[entry];
    const level =
      inventoryType === 18
        ? heldTemplate?.containerSlots
        : heldTemplate?.itemLevel;
    if (level === undefined) return undefined;
    levels.push(level);
  }
  if (levels.length === 0) return undefined;
  return inventoryType === 18 ? Math.max(...levels) : Math.min(...levels);
}

function classWears(
  allowableClass: number,
  id: number | undefined,
): boolean | undefined {
  if (id === undefined) return undefined;
  return Math.floor(allowableClass / 2 ** (id - 1)) % 2 === 1;
}

function wear(
  template: ItemTemplate,
  mark: BagMarkCtx,
): {
  canWear: boolean | undefined;
  requiredLevel: number | undefined;
} {
  if ((SLOTS_BY_TYPE[template.inventoryType] ?? []).length === 0)
    return { canWear: undefined, requiredLevel: undefined };
  const id = classId(mark.playerClass);
  const fits = classWears(template.allowableClass, id);
  if (mark.playerLevel === undefined || fits === undefined)
    return {
      canWear: undefined,
      requiredLevel: template.requiredLevel || undefined,
    };
  if (!fits)
    return {
      canWear: false,
      requiredLevel: template.requiredLevel || undefined,
    };
  return {
    canWear: mark.playerLevel >= template.requiredLevel,
    requiredLevel: template.requiredLevel || undefined,
  };
}

export function bagRow(
  slot: Occupied,
  template: ItemTemplate | undefined,
  mark: BagMarkCtx,
): BagRow {
  const base = {
    bag: slot.bag,
    count: slot.item.count ?? 1,
    entry: slot.item.entry,
    kind: itemKind(slot.item),
    name: bagItemName(slot),
    quality: slot.item.quality,
    slot: slot.slot,
  };
  const current = slot.item.durability;
  const fallback = template?.maxDurability;
  const observed = slot.item.maxDurability ?? fallback;
  const low =
    current !== undefined &&
    observed !== undefined &&
    observed > 0 &&
    current < observed / 4
      ? { current, max: observed }
      : undefined;
  const none = {
    ...base,
    canWear: undefined,
    durability: low,
    loadedAmmo:
      mark.inventory.ammoId !== undefined &&
      mark.inventory.ammoId === slot.item.entry,
    requiredLevel: undefined,
    secondsLeft: slot.item.duration || undefined,
    upgrade: undefined,
  };
  if (slot.item.entry === undefined || template === undefined) return none;
  const { canWear, requiredLevel } = wear(template, mark);
  const worn = wornLevel(mark, template.inventoryType);
  const mine =
    template.inventoryType === 18
      ? template.containerSlots
      : template.itemLevel;
  return {
    ...none,
    canWear,
    requiredLevel,
    upgrade:
      canWear === true && worn !== undefined && mine > worn
        ? { itemLevel: mine, wornItemLevel: worn }
        : undefined,
  };
}

export function secondsText(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m left` : `${hours}h left`;
  }
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m left`;
  return `${seconds}s left`;
}
