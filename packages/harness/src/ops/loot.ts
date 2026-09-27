import type { LootOutcome, NamedRewardsState } from "@peon/core";
import type { LootLine } from "#harness/contract/details";
import type { OpsCtx } from "#harness/contract/services";
import { itemIdText, nameLootLines } from "#harness/ops/item-names";

export type LootOpResult = {
  outcome: LootOutcome;
  items: LootLine[];
  copper: number;
  freeSlots: number | undefined;
};

type Label = { name: string; quality: number | null };

function readLabels(state: NamedRewardsState, into: Map<number, Label>): void {
  if (state.loot.phase !== "open" && state.loot.phase !== "closing") return;
  for (const item of state.loot.items)
    into.set(item.itemId, {
      name: item.name ?? itemIdText(item.itemId),
      quality: item.quality,
    });
}

function addLine(lines: LootLine[], line: LootLine): void {
  const same = lines.find((known) => known.itemId === line.itemId);
  if (same) same.count += line.count;
  else lines.push(line);
}

export async function lootCorpseOp(
  ctx: OpsCtx,
  guid: bigint,
): Promise<LootOpResult> {
  const labels = new Map<number, Label>();
  readLabels(ctx.handle.getRewardsState(), labels);
  const items: LootLine[] = [];
  let copper = 0;
  const off = ctx.handle.onRewardsEvent((event) => {
    if (event.type === "loot_opened")
      readLabels(ctx.handle.getRewardsState(), labels);
    const pushed = event.state.lastItemPush;
    if (event.type === "item_push" && pushed) {
      const label = labels.get(pushed.itemId);
      addLine(items, {
        count: pushed.count,
        itemId: pushed.itemId,
        name: label?.name ?? itemIdText(pushed.itemId),
        quality: label?.quality ?? null,
      });
    }
    const notice = event.state.lastMoneyNotice;
    if (event.type === "money_notice" && notice) copper += notice.money;
  });
  try {
    const outcome = await ctx.handle.lootCorpse(guid, ctx.signal);
    return {
      copper,
      freeSlots: ctx.handle.getInventoryState().freeSlots,
      items: await nameLootLines(ctx, items),
      outcome,
    };
  } finally {
    off();
  }
}
