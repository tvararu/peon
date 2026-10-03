import type { NamedInventoryState } from "@peon/core";
import type { GearAfter } from "#harness/areas/items/tool";
import type { ToolCtx } from "#harness/contract/services";
import { itemIdText } from "#harness/ops/item-names";
import { Refusal } from "#harness/ops/refusal";
import { nextCall } from "#harness/tools/next-call";

export const BACKPACK = 255;
export const FIRST_BAG = 19;
export const LAST_BAG = 22;

const ITEM_REF = /^item (\d+)$/i;
export const AT_REF = /^bag (\d+) slot (\d+)$/i;
const BAG_REF = /^bag (\d+)$/i;
const BAG_NUMBER = /^([12]?[0-9]|2[0-2])$/;
const BANK_WORD = /\bbank\b/i;
export const EQUIP_SLOTS: Record<string, number> = {
  back: 14,
  chest: 4,
  feet: 7,
  finger1: 10,
  finger2: 11,
  hands: 9,
  head: 0,
  legs: 6,
  main_hand: 15,
  neck: 1,
  off_hand: 16,
  ranged: 17,
  shirt: 3,
  shoulders: 2,
  tabard: 18,
  trinket1: 12,
  trinket2: 13,
  waist: 5,
  wrists: 8,
};

export type GearHandle = ToolCtx<GearAfter>["handle"];
export type Occupied = Extract<
  NamedInventoryState["slots"][number],
  { status: "occupied" }
>;
export type Found = { held: Occupied; label: string };
export type Region = Occupied["region"];
export type Position = { bag: number; slot: number };

export const BAGS = nextCall("journal", { about: "bags" });

export function slotsOf(state: NamedInventoryState): Occupied[] {
  return state.slots.filter(
    (slot): slot is Occupied => slot.status === "occupied",
  );
}

export function labelOf(held: Occupied): string {
  return held.item.name ?? itemIdText(held.item.entry ?? 0);
}

function exactPool(
  pool: Occupied[],
  trimmed: string,
  id: string | undefined,
): Occupied[] {
  const lowered = trimmed.toLowerCase();
  return pool.filter((held) =>
    id
      ? held.item.entry === Number(id)
      : held.item.name?.toLowerCase() === lowered,
  );
}

export function named(
  state: NamedInventoryState,
  text: string,
  regions: readonly Region[],
): Found {
  const trimmed = text.trim();
  const id = ITEM_REF.exec(trimmed)?.[1];
  const at = AT_REF.exec(trimmed);
  const pool = slotsOf(state).filter((slot) => regions.includes(slot.region));
  if (at?.[1] !== undefined && at[2] !== undefined) {
    const bag = Number(at[1]);
    const slot = Number(at[2]);
    const held = pool.find(
      (candidate) => candidate.bag === bag && candidate.slot === slot,
    );
    if (!held)
      throw new Refusal({
        detail: `bag ${bag} slot ${slot} holds nothing to act on.`,
        next: BAGS,
        reason: "no_such_item",
      });
    return { held, label: labelOf(held) };
  }
  const matches = exactPool(pool, trimmed, id);
  let near = matches;
  if (near.length === 0 && !id) {
    const lowered = trimmed.toLowerCase();
    near = pool.filter((slot) =>
      slot.item.name?.toLowerCase().includes(lowered),
    );
  }
  if (near.length === 0)
    throw new Refusal({
      detail: `no carried item matches "${text}".`,
      next: BAGS,
      reason: "no_such_item",
    });
  if (near.length > 1)
    throw new Refusal({
      detail: `"${text}" matches more than one item; name one bag and slot.`,
      next: BAGS,
      reason: "ambiguous_item",
    });
  const held = near[0];
  if (!held)
    throw new Refusal({
      detail: `no carried item matches "${text}".`,
      next: BAGS,
      reason: "no_such_item",
    });
  return { held, label: labelOf(held) };
}

export function equipSlot(text: string | undefined): number {
  if (text === undefined) return -1;
  const trimmed = text.trim().toLowerCase();
  const bag = BAG_NUMBER.exec(trimmed);
  if (bag?.[1] !== undefined) return Number(bag[1]);
  const slot = EQUIP_SLOTS[trimmed];
  if (slot === undefined)
    throw new Refusal({
      detail: `there is no equipment slot "${text}".`,
      next: BAGS,
      reason: "no_such_slot",
    });
  return slot;
}

export function position(text: string, prefix: string): Position {
  const at = AT_REF.exec(text.trim());
  if (at?.[1] !== undefined && at[2] !== undefined)
    return { bag: Number(at[1]), slot: Number(at[2]) };
  throw new Refusal({
    detail: `${prefix}; got "${text.trim()}", which is not a bag and slot.`,
    next: BAGS,
    reason: "bad_position",
  });
}

function ordinalBag(text: string, value: number): number | undefined {
  const bag = BAG_REF.exec(text);
  if (bag?.[1] === undefined) {
    if (value === BACKPACK || (value >= FIRST_BAG && value <= LAST_BAG))
      return value;
    return undefined;
  }
  if (value >= 1 && value <= 4) return FIRST_BAG + value - 1;
  if (value === BACKPACK || (value >= FIRST_BAG && value <= LAST_BAG))
    return value;
  return undefined;
}

function noSuchBag(text: string): Refusal {
  return new Refusal({
    detail: `there is no bag "${text}"; use bags, backpack, bag 1-4, or bag 19-22.`,
    next: BAGS,
    reason: "no_such_bag",
  });
}

export function atBag(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const trimmed = text.trim().toLowerCase();
  if (trimmed === "bags") return undefined;
  if (trimmed === "backpack") return BACKPACK;
  const at = AT_REF.exec(text.trim());
  if (at?.[1] !== undefined) return Number(at[1]);
  return bagNumber(text);
}

export function bagNumber(text: string | undefined): number {
  if (text === undefined) return 0;
  const trimmed = text.trim().toLowerCase();
  if (trimmed === "bags" || trimmed === "backpack") return BACKPACK;
  const bag = BAG_REF.exec(trimmed);
  const value = bag?.[1] === undefined ? Number(trimmed) : Number(bag[1]);
  const resolved = ordinalBag(trimmed, value);
  if (resolved !== undefined) return resolved;
  throw noSuchBag(text);
}

export function freeSlots(state: NamedInventoryState): Position[] {
  return state.slots
    .filter(
      (slot) =>
        slot.status === "empty" &&
        (slot.region === "backpack" || slot.region === "bag_item"),
    )
    .map((slot) => ({ bag: slot.bag, slot: slot.slot }));
}

export function firstFree(
  handle: GearHandle,
  want: (slot: Position) => boolean,
  detail: string,
  reason: string,
): Position {
  const free = freeSlots(handle.getInventoryState()).find(want);
  if (!free)
    throw new Refusal({
      detail,
      next: BAGS,
      reason,
    });
  return free;
}

type BankHit = { kind: "bank" };

export function bankDestination(text: string | undefined): BankHit | undefined {
  if (text === undefined) return undefined;
  return BANK_WORD.test(text.trim()) ? { kind: "bank" } : undefined;
}

export function destination(
  handle: GearHandle,
  text: string | undefined,
  from: Position,
): Position {
  if (text === undefined)
    return firstFree(handle, () => true, "the bags are full.", "bags_full");
  const trimmed = text.trim().toLowerCase();
  if (trimmed === "bags")
    return firstFree(
      handle,
      (slot) => slot.bag === BACKPACK || slot.bag >= FIRST_BAG,
      "the bags are full.",
      "bags_full",
    );
  if (trimmed === "backpack")
    return firstFree(
      handle,
      (slot) => slot.bag === BACKPACK,
      "the backpack is full.",
      "bags_full",
    );
  const bag = BAG_REF.exec(trimmed);
  if (bag?.[1] !== undefined) {
    const slots = handle.getInventoryState().slots;
    const number = ordinalBag(trimmed, Number(bag[1]));
    if (number === undefined) throw noSuchBag(text);
    const equipped =
      number === BACKPACK ||
      slots.some(
        (slot) =>
          slot.bag === number ||
          (slot.region === "bag" &&
            slot.status === "occupied" &&
            "slot" in slot &&
            slot.slot === number),
      );
    if (!equipped) throw noSuchBag(text);
    const full =
      number === BACKPACK ? "the backpack is full." : `bag ${number} is full.`;
    return firstFree(handle, (slot) => slot.bag === number, full, "bags_full");
  }
  const at = position(text, "name a bag and slot to move to");
  if (at.bag === from.bag && at.slot === from.slot)
    throw new Refusal({
      detail: "the item is already there.",
      next: BAGS,
      reason: "no_change",
    });
  return at;
}
