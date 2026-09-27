import type {
  LootOutcome,
  NamedLootItem,
  NamedRewardsState,
  RewardsEvent,
} from "@peon/core";
import { messageOf } from "@peon/core/lib/errors";
import type { LootLine } from "#harness/contract/details";
import type { OpsCtx } from "#harness/contract/services";
import { itemIdText, nameLootLines } from "#harness/ops/item-names";
import { settle } from "#harness/ops/settle";

export type LootOpResult = {
  outcome: LootOutcome;
  items: LootLine[];
  copper: number;
  freeSlots: number | undefined;
};

type Label = { name: string; quality: number | null };

const LOOT_STEP_MS = 3000;

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

function step(
  ctx: OpsCtx,
  match: (event: RewardsEvent) => boolean,
  send: () => void,
) {
  return settle<RewardsEvent>({
    match,
    send: () => ctx.rt.mutex.run(send),
    signal: ctx.signal,
    subscribe: (cb) => ctx.handle.onRewardsEvent(cb),
    timeoutMs: LOOT_STEP_MS,
  });
}

function isRelease(event: RewardsEvent): boolean {
  return event.type === "loot_release_observed";
}

function isOpenAnswer(event: RewardsEvent): boolean {
  return (
    event.type === "loot_opened" ||
    event.type === "loot_open_failed" ||
    event.type === "loot_error"
  );
}

function isMoneyAnswer(event: RewardsEvent): boolean {
  return event.type === "money_notice" || event.type === "loot_money_cleared";
}

async function takeItems(
  ctx: OpsCtx,
  items: readonly NamedLootItem[],
): Promise<{ slotsTaken: number[]; slotsLeft: number[] }> {
  const slotsTaken: number[] = [];
  const slotsLeft: number[] = [];
  for (const item of items) {
    const answer = await step(
      ctx,
      (event) =>
        (event.type === "item_push" &&
          event.state.lastItemPush?.itemId === item.itemId) ||
        event.type === "inventory_error" ||
        event.type === "loot_error",
      () => ctx.handle.takeLoot(item.slot),
    );
    if (answer?.type === "item_push") slotsTaken.push(item.slot);
    else slotsLeft.push(item.slot);
  }
  return { slotsLeft, slotsTaken };
}

async function harnessLoot(ctx: OpsCtx, guid: bigint): Promise<LootOutcome> {
  const { handle } = ctx;
  if (handle.getRewardsState().loot.phase !== "closed")
    await step(ctx, isRelease, () => handle.releaseLoot());
  const coinageBefore = handle.getInventoryState().coinage;
  const opened = await step(ctx, isOpenAnswer, () => handle.openLoot(guid));
  if (!opened) return { cause: "loot_open_unanswered", ok: false };
  if (opened.type !== "loot_opened") return { cause: opened.type, ok: false };
  const { loot } = handle.getRewardsState();
  if (loot.phase !== "open") return { cause: "loot_not_open", ok: false };
  const taken = await takeItems(ctx, loot.items);
  if (loot.money > 0)
    await step(ctx, isMoneyAnswer, () => handle.takeLootMoney());
  await step(ctx, isRelease, () => handle.releaseLoot());
  if (loot.items.length === 0 && loot.money === 0)
    return { ok: true, record: undefined };
  return {
    ok: true,
    record: {
      ...taken,
      coinageAfter: handle.getInventoryState().coinage,
      coinageBefore,
      guid: guid.toString(),
      moneyTaken: loot.money,
    },
  };
}

async function lootWith(ctx: OpsCtx, guid: bigint): Promise<LootOutcome> {
  try {
    return await ctx.handle.lootCorpse(guid, ctx.signal);
  } catch (error) {
    if (messageOf(error) !== "not_implemented") throw error;
    return harnessLoot(ctx, guid);
  }
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
    const outcome = await lootWith(ctx, guid);
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
