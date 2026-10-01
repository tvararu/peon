import type { NamedInventorySlot, NamedInventoryState } from "@peon/core";
import type { BankView } from "#harness/contract/details";

type Occupied = Extract<NamedInventorySlot, { status: "occupied" }>;

const LINE_BUDGET = 21;

function occupiedOf(inventory: NamedInventoryState): Occupied[] {
  return [...(inventory.bank?.slots ?? [])].filter(
    (slot): slot is Occupied =>
      slot.status === "occupied" &&
      (slot.region === "bank" ||
        slot.region === "bankbag" ||
        slot.region === "bank_bag_item"),
  );
}

export function bankViewOf(inventory: NamedInventoryState): BankView {
  const bank = inventory.bank;
  if (bank === undefined)
    return { bagSlots: undefined, free: undefined, known: false, lines: [] };
  const held = bank.slots.filter(
    (slot) => slot.region === "bank" && slot.bag === 255,
  ).length;
  const free = held <= 28 ? 28 - held : 0;
  const lines = occupiedOf(inventory).map((slot, index) => ({
    bag: slot.bag,
    count: slot.item.count ?? 1,
    entry: slot.item.entry,
    line: index + 1,
    name: slot.item.name ?? `item ${slot.item.entry ?? 0}`,
    slot: slot.slot,
  }));
  return { bagSlots: undefined, free, known: true, lines };
}

export function bankBodyOf(
  view: BankView,
  bagSlots: number | undefined,
): string[] {
  if (!view.known) return ["Bank: unknown."];
  const head =
    view.lines.length === 0
      ? "Bank: empty."
      : `Bank: ${view.lines.map((row) => `${row.line}. ${row.name} x${row.count}`).join("; ")}.`;
  const freeText =
    view.free === undefined
      ? "free bank slots unknown"
      : `${view.free} free bank slots`;
  const slotsText =
    bagSlots === undefined ? "bag slots unknown" : `${bagSlots} bag slots`;
  const lines = [head, `${freeText}. ${slotsText}.`];
  if (view.lines.length <= LINE_BUDGET) return lines;
  const groups = new Map<string, { count: number; name: string }>();
  for (const row of view.lines) {
    const seen = groups.get(row.name) ?? { count: 0, name: row.name };
    seen.count += row.count;
    groups.set(row.name, seen);
  }
  const compact = [...groups.values()].map(
    (row) => `${row.name} x${row.count}`,
  );
  return [
    `Bank: ${view.lines.length} items: ${compact.join("; ")}.`,
    `${freeText}. ${slotsText}.`,
  ];
}
