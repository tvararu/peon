import type { AreaEventOf } from "@peon/core";
import type { InteractAfter } from "#harness/contract/details";
import type { ToolCtx } from "#harness/contract/services";
import { itemIdText, itemLabelIn } from "#harness/ops/item-names";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import {
  baseAfter,
  type InteractStep,
  moneyChange,
  moneyText,
  type NpcTarget,
  npcLabel,
} from "#harness/tools/interact-quest";
import { openVendorWindow } from "#harness/tools/interact-vendor";
import { nextCall } from "#harness/tools/next-call";

type BuybackEvent = AreaEventOf<"buyback">;
type BuybackList = Extract<BuybackEvent, { type: "listed" }>["list"];

const LINE_NUMBER = /^\d+$/;
const ITEM_ID = /^item (\d+)$/;
const NO_ANSWER = "no_answer";

function soldName(
  ctx: ToolCtx<InteractAfter>,
  entry: number | undefined,
): string {
  if (entry === undefined) return "an item";
  return (
    itemLabelIn(ctx.handle)(entry)?.name ??
    ctx.handle.itemLabel(entry).name ??
    itemIdText(entry)
  );
}

type NamedSold = { name: string; row: BuybackList[number] };

function matchSold(
  named: NamedSold[],
  listing: string[],
  what: string,
): BuybackList[number] {
  const trimmed = what.trim();
  if (LINE_NUMBER.test(trimmed)) {
    const found = named.find(({ row }) => row.slot === Number(trimmed));
    if (found) return found.row;
  }
  const id = ITEM_ID.exec(trimmed);
  if (id) {
    const found = named.find(({ row }) => row.entry === Number(id[1]));
    if (found) return found.row;
  }
  const needle = trimmed.toLowerCase();
  const hits = named.filter(({ name }) => name.toLowerCase().includes(needle));
  const single = hits[0];
  if (hits.length === 1 && single) return single.row;
  if (hits.length > 1)
    throw new Refusal({
      body: hits.map(({ name }) => `what: "${name}"`),
      detail: `several buyback items match "${what}".`,
      next: nextCall("journal", { about: "bags" }),
      reason: "ambiguous_item",
    });
  throw new Refusal({
    body: listing,
    detail: `"${what}" is not in the buyback list.`,
    next: nextCall("journal", { about: "bags" }),
    reason: "not_in_buyback",
  });
}

function pickSold(
  npc: NpcTarget,
  list: BuybackList,
  ctx: ToolCtx<InteractAfter>,
  what: string | undefined,
): BuybackList[number] {
  const named = list.map((row) => ({ name: soldName(ctx, row.entry), row }));
  const listing = named.map(({ name }) => `what: "${name}"`);
  if (list.length === 0)
    throw new Refusal({
      detail: `${npcLabel(npc)} holds nothing to buy back.`,
      next: nextCall("journal", { about: "bags" }),
      reason: "not_in_buyback",
    });
  if (what !== undefined) return matchSold(named, listing, what);
  const only = list[0];
  if (list.length === 1 && only) return only;
  throw new Refusal({
    body: listing,
    detail: `${npcLabel(npc)} holds ${list.length} items to buy back; name one.`,
    next: nextCall("journal", { about: "bags" }),
    reason: "not_in_buyback",
  });
}

function noWindow(npc: NpcTarget): Refusal {
  return new Refusal({
    detail: `${npcLabel(npc)} did not open a vendor window in 5 s.`,
    next: nextCall("interact", { npc: npc.unit.ref }),
    reason: "no_vendor_window",
    status: "UNCONFIRMED",
  });
}

export const buybackStep: InteractStep = async ({ args, ctx, npc }) => {
  if (!(await openVendorWindow(ctx, npc))) throw noWindow(npc);
  const sold = pickSold(npc, ctx.handle.buyback.state().list, ctx, args.what);
  const name = soldName(ctx, sold.entry);
  const before = ctx.handle.getInventoryState().coinage;
  const outcome = await ctx.rt.mutex.run(async () => {
    ctx.handle.takeControl("manual_override");
    return await ctx.handle.buyback.act.buyback(sold.slot);
  });
  const change = moneyChange(ctx, before);
  let paid = "";
  if (sold.price !== undefined) paid = ` for ${sold.price} copper`;
  else if (change !== undefined)
    paid = ` for ${change.before - change.after} copper`;
  if (outcome.status === "ok")
    return result("DONE", {
      after: { ...baseAfter(ctx, npc, "buyback"), money: change },
      detail: `Bought back ${name}${paid}.${moneyText(change)}`,
    });
  if (outcome.status === "unanswered")
    return result("UNCONFIRMED", {
      after: { ...baseAfter(ctx, npc, "buyback"), money: change },
      detail: `${npcLabel(npc)} did not answer the buyback in 5 s.`,
      next: nextCall("journal", { about: "bags" }),
      reason: NO_ANSWER,
    });
  return result("FAILED", {
    after: { ...baseAfter(ctx, npc, "buyback"), money: change },
    detail: `${npcLabel(npc)} refused the buyback (${outcome.reason}).`,
    next: nextCall("journal", { about: "bags" }),
    reason: outcome.reason,
  });
};
