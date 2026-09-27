import type { NamedVendorGood, VendorEvent } from "@tuicraft/core";
import type {
  InteractAfter,
  LootLine,
  StockLine,
} from "#harness/contract/details";
import type { ToolCtx } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { nextCall, result } from "#harness/tools/define";
import {
  ANSWER_MS,
  baseAfter,
  type InteractStep,
  moneyChange,
  moneyText,
  type NpcTarget,
  npcLabel,
  send,
  shortMoney,
  type TalkExtra,
} from "#harness/tools/interact-quest";

const STOCK_SHOWN = 8;
const VENDOR_ROLES = new Set([
  "vendor",
  "vendor_ammo",
  "vendor_food",
  "vendor_poison",
  "vendor_reagent",
]);
const JUNK_QUALITY = 0;
const BAG_REGIONS = new Set(["backpack", "bag_item"]);

function vendorStep(
  ctx: ToolCtx<InteractAfter>,
  init: { settled: readonly VendorEvent["type"][]; packet: () => void },
): Promise<VendorEvent | undefined> {
  return settle<VendorEvent>({
    match: (event) => init.settled.includes(event.type),
    send: send(ctx, init.packet),
    signal: ctx.signal,
    subscribe: (cb) => ctx.handle.onVendorEvent(cb),
    timeoutMs: ANSWER_MS,
  });
}

export async function openVendorWindow(
  ctx: ToolCtx<InteractAfter>,
  npc: NpcTarget,
): Promise<NamedVendorGood[] | undefined> {
  const listed = await vendorStep(ctx, {
    packet: () => ctx.handle.openVendor(npc.guid),
    settled: ["listed", "refused", "unanswered"],
  });
  return listed?.type === "listed"
    ? ctx.handle.getVendorState().window?.items
    : undefined;
}

function nameOf(good: NamedVendorGood): string {
  return good.name ?? `item ${good.itemId}`;
}

export function stockLines(goods: readonly NamedVendorGood[]): StockLine[] {
  return goods.map((good, index) => ({
    available: good.stock ?? undefined,
    itemId: good.itemId,
    line: index + 1,
    name: nameOf(good),
    price: good.price,
    stack: good.buyCount,
  }));
}

function stockText(stock: readonly StockLine[]): string {
  const shown = stock
    .slice(0, STOCK_SHOWN)
    .map((line) => `${line.name} ${shortMoney(line.price)}`);
  const more =
    stock.length > STOCK_SHOWN ? `, +${stock.length - STOCK_SHOWN} more` : "";
  return `Sells: ${shown.join(", ")}${more}.`;
}

export const vendorExtra: TalkExtra = async ({ ctx, npc }) => {
  if (!npc.unit.roles.some((role) => VENDOR_ROLES.has(role)))
    return { after: {}, lines: [] };
  const goods = await openVendorWindow(ctx, npc);
  if (!goods)
    return { after: {}, lines: ["The vendor window did not open in 5 s."] };
  const stock = stockLines(goods);
  return { after: { stock }, lines: [stockText(stock)] };
};

function pickGood(
  npc: NpcTarget,
  goods: readonly NamedVendorGood[],
  what: string | undefined,
): NamedVendorGood {
  const stock = stockLines(goods);
  const body = stock
    .slice(0, STOCK_SHOWN)
    .map((line) => `${line.line}. ${line.name} ${shortMoney(line.price)}`);
  const [first] = stock;
  const buy = (name: string) =>
    nextCall("interact", { do: "buy", npc: npc.unit.ref, what: name });
  if (what === undefined)
    throw new Refusal({
      body,
      detail: `say what to buy from ${npcLabel(npc)}.`,
      next: first ? buy(first.name) : undefined,
      reason: "what_needed",
    });
  const text = what.trim().toLowerCase();
  const matches = goods.filter((good) =>
    nameOf(good).toLowerCase().includes(text),
  );
  const names = [...new Set(matches.map(nameOf))];
  const [match] = matches;
  if (match && names.length === 1) return match;
  if (names.length === 0)
    throw new Refusal({
      body,
      detail: `${npcLabel(npc)} sells nothing called "${what}".`,
      next: first ? buy(first.name) : undefined,
      reason: "no_match",
    });
  throw new Refusal({
    body: names.map(buy),
    detail: `"${what}" matches ${names.length} items.`,
    next: buy(names[0] ?? what),
    reason: "ambiguous_item",
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

export const buyStep: InteractStep = async ({ args, ctx, npc }) => {
  const goods = await openVendorWindow(ctx, npc);
  if (!goods) throw noWindow(npc);
  const good = pickGood(npc, goods, args.what);
  const before = ctx.handle.getInventoryState().coinage;
  const wanted = args.count ?? 1;
  let bought = 0;
  let refusal: string | undefined;
  while (bought < wanted && refusal === undefined) {
    const answer = await vendorStep(ctx, {
      packet: () => ctx.handle.buyItem(good.slot),
      settled: ["bought", "refused", "partial", "unanswered"],
    });
    if (answer?.type === "bought") bought += 1;
    else
      refusal =
        answer?.state.lastOutcome?.reason ?? answer?.type ?? "no_answer";
  }
  const change = moneyChange(ctx, before);
  const spent = change ? change.before - change.after : good.price * bought;
  const line: LootLine = {
    count: bought * good.buyCount,
    itemId: good.itemId,
    name: nameOf(good),
    quality: good.quality,
  };
  const after = {
    ...baseAfter(ctx, npc, "buy"),
    bought: line,
    money: change,
    stock: stockLines(goods),
  };
  const detail = `bought ${line.name} x${line.count} for ${shortMoney(spent)}${moneyText(change)}. Bags: ${after.freeSlots ?? "?"} free.`;
  if (refusal === undefined) return result("DONE", { after, detail });
  if (bought > 0)
    return result("PARTLY", {
      after,
      detail: `${detail} Then: ${refusal}.`,
      next: nextCall("journal", { about: "bags" }),
      reason: refusal,
    });
  return result("FAILED", {
    after,
    detail: `${npcLabel(npc)} refused the sale (${refusal}).`,
    next: nextCall("journal", { about: "bags" }),
    reason: refusal,
  });
};

export const sellJunkStep: InteractStep = async ({ ctx, npc }) => {
  const junk = ctx.handle
    .getInventoryState()
    .slots.flatMap((slot) =>
      slot.status === "occupied" &&
      slot.item.quality === JUNK_QUALITY &&
      BAG_REGIONS.has(slot.region)
        ? [slot]
        : [],
    );
  const after = baseAfter(ctx, npc, "sell_junk");
  if (junk.length === 0)
    return result("DONE", {
      after,
      detail: "you have no junk (grey items) to sell.",
    });
  if (!(await openVendorWindow(ctx, npc))) throw noWindow(npc);
  const before = ctx.handle.getInventoryState().coinage;
  const sold: LootLine[] = [];
  for (const slot of junk) {
    const answer = await vendorStep(ctx, {
      packet: () => ctx.handle.sellItem(slot.bag, slot.slot),
      settled: ["sold", "refused", "partial", "unanswered"],
    });
    if (answer?.type === "sold")
      sold.push({
        count: slot.item.count ?? 1,
        itemId: slot.item.entry ?? 0,
        name: slot.item.name ?? "item",
        quality: slot.item.quality,
      });
  }
  const change = moneyChange(ctx, before);
  const gain = change ? change.after - change.before : 0;
  const status = sold.length === junk.length ? "DONE" : "PARTLY";
  return result(status, {
    after: { ...after, money: change, sold },
    detail: `sold ${sold.length} of ${junk.length} junk items for ${shortMoney(gain)}${moneyText(change)}.`,
    reason: status === "DONE" ? undefined : "sell_refused",
  });
};
