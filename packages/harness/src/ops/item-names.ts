import type { WorldHandle } from "@tuicraft/core";
import type { LootLine } from "#harness/contract/details";

export const ITEM_NAME_WAIT_MS = 2000;
const POLL_MS = 50;

export type ItemName = { name: string; quality: number | null };
export type ItemNameOf = (itemId: number) => string | undefined;
type NameSources = Pick<
  WorldHandle,
  "getInventoryState" | "getRewardsState" | "getVendorState"
>;
type WaitInit = { timeoutMs: number; signal?: AbortSignal | undefined };

export function itemIdText(itemId: number): string {
  return `item ${itemId}`;
}

function labelled(
  name: string | null | undefined,
  quality: number | null,
): ItemName | undefined {
  return name ? { name, quality } : undefined;
}

type LabelOf = (itemId: number) => ItemName | undefined;

function bagLabel(handle: NameSources): LabelOf {
  return (itemId) => {
    for (const slot of handle.getInventoryState().slots) {
      if (slot.status !== "occupied" || slot.item.entry !== itemId) continue;
      const found = labelled(slot.item.name, slot.item.quality);
      if (found) return found;
    }
  };
}

function lootLabel(handle: NameSources): LabelOf {
  return (itemId) => {
    const { loot } = handle.getRewardsState();
    if (loot.phase !== "open" && loot.phase !== "closing") return;
    const item = loot.items.find((candidate) => candidate.itemId === itemId);
    return item && labelled(item.name, item.quality);
  };
}

function vendorLabel(handle: NameSources): LabelOf {
  return (itemId) => {
    const good = handle
      .getVendorState()
      .window?.items.find((candidate) => candidate.itemId === itemId);
    return good && labelled(good.name, good.quality);
  };
}

export function itemLabelIn(handle: NameSources): LabelOf {
  const sources = [bagLabel(handle), lootLabel(handle), vendorLabel(handle)];
  return (itemId) => {
    for (const source of sources) {
      const found = source(itemId);
      if (found) return found;
    }
  };
}

function tick(signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, POLL_MS);
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    function done() {
      signal?.removeEventListener("abort", abort);
      resolve();
    }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function awaitItemNames(
  itemIds: readonly number[],
  nameOf: ItemNameOf,
  { signal, timeoutMs }: WaitInit,
): Promise<void> {
  const pending = () => itemIds.some((itemId) => !nameOf(itemId));
  for (let waited = 0; pending() && waited < timeoutMs; waited += POLL_MS) {
    signal?.throwIfAborted();
    await tick(signal);
  }
}

export async function nameLootLines(
  ctx: { handle: NameSources; signal?: AbortSignal | undefined },
  lines: readonly LootLine[],
  timeoutMs = ITEM_NAME_WAIT_MS,
): Promise<LootLine[]> {
  const labelOf = itemLabelIn(ctx.handle);
  const unnamed = lines
    .filter((line) => line.name === itemIdText(line.itemId))
    .map((line) => line.itemId);
  await awaitItemNames(unnamed, (itemId) => labelOf(itemId)?.name, {
    signal: ctx.signal,
    timeoutMs,
  });
  return lines.map((line) => {
    if (!unnamed.includes(line.itemId)) return line;
    const label = labelOf(line.itemId);
    return label
      ? { ...line, name: label.name, quality: line.quality ?? label.quality }
      : line;
  });
}
