import type { RewardsEvent, RewardsOpenLoot } from "@peon/core";
import type { GearAfter } from "#harness/areas/items/tool";
import type { LootLine } from "#harness/contract/details";
import type { ToolCtx } from "#harness/contract/services";
import { itemIdText } from "#harness/ops/item-names";
import { settle } from "#harness/ops/settle";

type GearCtx = ToolCtx<GearAfter>;
type Handle = GearCtx["handle"];

export const TAKE_SETTLE_MS = 5000;

export function takeMatched(
  event: RewardsEvent,
  slot: number,
): boolean | undefined {
  if (event.type === "loot_error" || event.type === "inventory_error")
    return false;
  if (event.type === "loot_removed") {
    const { loot } = event.state;
    if (loot.phase !== "open" && loot.phase !== "closing") return undefined;
    return loot.items.some((offered) => offered.slot === slot)
      ? undefined
      : true;
  }
  if (event.type === "loot_release_observed") return false;
  return undefined;
}

export function lootText(taken: readonly LootLine[], copper: number): string {
  const parts = taken.map((line) => `${line.name} x${line.count}`);
  if (copper > 0) parts.push(`${copper} copper`);
  return parts.join(", ");
}

function recordPush(
  taken: LootLine[],
  labels: Record<number, string>,
  pushed: { count: number; itemId: number },
): void {
  const known = taken.find((line) => line.itemId === pushed.itemId);
  const label = labels[pushed.itemId] ?? itemIdText(pushed.itemId);
  if (known) known.count += pushed.count;
  else
    taken.push({
      count: pushed.count,
      itemId: pushed.itemId,
      name: label,
      quality: null,
    });
}

function labelsOf(loot: RewardsOpenLoot): Record<number, string> {
  const labels: Record<number, string> = {};
  for (const offered of loot.items)
    labels[offered.itemId] = itemIdText(offered.itemId);
  return labels;
}

export async function takeOffered(
  ctx: GearCtx,
  loot: RewardsOpenLoot,
): Promise<{ taken: LootLine[]; copper: number }> {
  const { handle, rt, signal } = ctx;
  const labels = labelsOf(loot);
  const taken: LootLine[] = [];
  let copper = 0;
  const off = handle.onRewardsEvent((event) => {
    const pushed = event.state.lastItemPush;
    if (event.type === "item_push" && pushed) recordPush(taken, labels, pushed);
    const notice = event.state.lastMoneyNotice;
    if (event.type === "money_notice" && notice) copper += notice.money;
  });
  try {
    for (const item of [...loot.items]) {
      if (item.slotType !== 0 && item.slotType !== 4) continue;
      if (!loot.items.some((offered) => offered.slot === item.slot)) continue;
      let removed = false;
      let received = 0;
      let failed = false;
      const settled_ = await settle({
        match: (event: RewardsEvent) => {
          const matched = takeMatched(event, item.slot);
          if (matched === false) failed = true;
          if (matched === true) removed = true;
          const pushed = event.state.lastItemPush;
          if (event.type === "item_push" && pushed?.itemId === item.itemId)
            received += pushed.count;
          return failed || (removed && received >= item.count);
        },
        send: () => rt.mutex.run(() => handle.takeLoot(item.slot)),
        signal,
        subscribe: (cb) => (handle as Handle).onRewardsEvent(cb),
        timeoutMs: TAKE_SETTLE_MS,
      });
      if (!settled_ || failed) return { copper, taken };
    }
    await takeMoney(ctx);
    return { copper, taken };
  } finally {
    off();
  }
}

async function takeMoney(ctx: GearCtx): Promise<void> {
  const { handle, rt } = ctx;
  const money = handle.getRewardsState().loot;
  if (money.phase === "open" && money.money > 0)
    await rt.mutex.run(() => handle.takeLootMoney());
  await rt.mutex.run(() => handle.releaseLoot());
}
