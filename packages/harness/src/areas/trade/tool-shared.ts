import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";
import type { AreaState, NamedInventoryState } from "@peon/core";
import { AT_REF, type Occupied } from "#harness/areas/items/tool-resolve";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { parseRef } from "#harness/ops/refs";
import { Refusal } from "#harness/ops/refusal";
import { knownUnits } from "#harness/ops/views";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

export const tradeParams = Type.Object({
  accept: Type.Optional(
    Type.Boolean({
      description: "For answer: false refuses the request. Default true.",
    }),
  ),
  do: Type.Optional(
    StringEnum(["give", "answer", "offer", "accept", "cancel", "show"], {
      description:
        "give: offer items and gold to a player and accept. answer: answer a request. offer: change your offer. accept: accept the open trade. cancel: cancel the trade. show: read both offers. Default show.",
    }),
  ),
  gold: Type.Optional(
    Type.Number({
      description: "For give and offer: copper to offer. Default 0.",
    }),
  ),
  items: Type.Optional(
    Type.Array(Type.String(), {
      description:
        'For give and offer: item names from journal bags. A named item is offered as its whole stack. Use "bag 255 slot 25" to pick one of two stacks with the same name.',
    }),
  ),
  version: Type.Optional(
    Type.Number({
      description:
        "For accept: the offer version from the last show. Omit to accept the latest.",
    }),
  ),
  with: Type.Optional(
    Type.String({
      description: 'For give: a player name or ref like "u3" from look.',
    }),
  ),
});

export type TradeArgs = Static<typeof tradeParams>;
export type TradeDo =
  | "give"
  | "answer"
  | "offer"
  | "accept"
  | "cancel"
  | "show";

export type TradeAfter = {
  do: TradeDo;
  with: string | undefined;
  items: string[];
  gold: number;
  version: number | undefined;
};

export type TradeCtx = ToolCtx<TradeAfter>;
export type TradeState = AreaState<"trade">;

export type Picked = {
  bag: number;
  count: number;
  slot: number;
  label: string;
};

export function stackText(item: Picked): string {
  return item.count > 1 ? `${item.count} ${item.label}` : item.label;
}

export type Settled =
  | { status: "ok" }
  | { status: "refused"; reason: string }
  | { status: "unanswered" }
  | { status: "superseded" };

export const TRADE_SLOTS = 6;
const TRADE_RANGE_YD = 11.11;
const ITEM_ID = /^item (\d+)$/i;

export function emptyTrade(): TradeAfter {
  return {
    do: "show",
    gold: 0,
    items: [],
    version: undefined,
    with: undefined,
  };
}

export function afterOf(
  verb: TradeDo,
  over: Partial<TradeAfter> = {},
): TradeAfter {
  return { ...emptyTrade(), do: verb, ...over };
}

export function refusalOf(
  reason: string,
  detail: string,
  next?: string,
): Refusal {
  return new Refusal({
    detail,
    next: next ?? nextCall("trade", { do: "show" }),
    reason,
  });
}

export function bagsNext(): string {
  return nextCall("journal", { about: "bags" });
}

export function lookNext(): string {
  return nextCall("look");
}

function tradeNext(verb: TradeDo): string {
  return nextCall("trade", { do: verb === "give" ? "show" : verb });
}

function occupied(state: NamedInventoryState): Occupied[] {
  return state.slots.filter(
    (slot): slot is Occupied => slot.status === "occupied",
  );
}

function itemLabel(held: Occupied): string {
  return held.item.name ?? `item ${held.item.entry ?? 0}`;
}

function matchesFor(pool: Occupied[], text: string): Occupied[] {
  const trimmed = text.trim();
  const at = AT_REF.exec(trimmed);
  if (at?.[1] !== undefined && at[2] !== undefined) {
    const [bag, slot] = [Number(at[1]), Number(at[2])];
    return pool.filter((held) => held.bag === bag && held.slot === slot);
  }
  const id = ITEM_ID.exec(trimmed)?.[1];
  const lower = trimmed.toLowerCase();
  if (id) return pool.filter((held) => held.item.entry === Number(id));
  const exact = pool.filter((held) => held.item.name?.toLowerCase() === lower);
  if (exact.length > 0) return exact;
  return pool.filter((held) => held.item.name?.toLowerCase().includes(lower));
}

export function pickCarried(ctx: TradeCtx, text: string): Picked {
  const pool = occupied(ctx.handle.getInventoryState());
  const near = matchesFor(pool, text);
  const held = near[0];
  if (held === undefined)
    throw refusalOf(
      "no_such_item",
      `no carried item matches "${text}".`,
      bagsNext(),
    );
  if (near.length > 1)
    throw refusalOf(
      "ambiguous_item",
      `"${text}" matches more than one item; name one bag and slot, like "bag 255 slot 25".`,
      bagsNext(),
    );
  if (held.region !== "backpack" && held.region !== "bag_item")
    throw refusalOf(
      "equipped_item",
      `${itemLabel(held)} is equipped; trade only carried items.`,
      bagsNext(),
    );
  return {
    bag: held.bag,
    count: held.item.count ?? 1,
    label: itemLabel(held),
    slot: held.slot,
  };
}

export function pickAll(ctx: TradeCtx, names: string[]): Picked[] {
  if (names.length > TRADE_SLOTS)
    throw refusalOf(
      "too_many_items",
      `A trade holds 6 items, not ${names.length}.`,
      bagsNext(),
    );
  const picked = names.map((name) => pickCarried(ctx, name));
  const seen: Record<string, true> = {};
  for (const item of picked) {
    const key = `${item.bag}/${item.slot}`;
    if (seen[key])
      throw refusalOf(
        "duplicate_item",
        `${item.label} is named twice; name each item once.`,
        bagsNext(),
      );
    seen[key] = true;
  }
  return picked;
}

export function resolvePlayer(ctx: TradeCtx, with_: string): bigint {
  const wanted = with_.trim();
  const players = knownUnits(ctx).filter((unit) => unit.kind === "player");
  const found = parseRef(wanted)
    ? players.find((unit) => unit.ref === wanted)
    : players.find((unit) => unit.name.toLowerCase() === wanted.toLowerCase());
  if (!found)
    throw refusalOf("not_seen", `no player "${with_}" is in view.`, lookNext());
  if (found.distance !== undefined && found.distance > TRADE_RANGE_YD)
    throw refusalOf(
      "too_far",
      `${found.name} is ${found.distance} yd away; trade needs 11.11 yd.`,
      lookNext(),
    );
  return BigInt(`0x${found.guid}`);
}

export function playerName(ctx: TradeCtx, guid: bigint): string {
  const hex = guid.toString(16);
  const seen = knownUnits(ctx).find(
    (unit) => unit.kind === "player" && unit.guid.toLowerCase() === hex,
  );
  return seen?.name ?? `player ${guid.toString(10)}`;
}

export function refusalFor(outcome: Settled, verb: TradeDo): Refusal {
  if (outcome.status === "unanswered")
    return refusalOf(
      "no_answer",
      "The trade went unanswered.",
      tradeNext(verb),
    );
  if (outcome.status === "superseded")
    return refusalOf(
      "superseded",
      "Another trade request arrived; read it first.",
      tradeNext(verb),
    );
  const why = outcome.status === "refused" ? outcome.reason : outcome.status;
  return refusalOf(
    "trade_refused",
    `The trade was refused (${why}).`,
    tradeNext(verb),
  );
}

export function settleOutcome(
  outcome: Settled,
  verb: TradeDo,
  ok: TradeAfter,
): ToolResult<TradeAfter> {
  if (outcome.status !== "ok") throw refusalFor(outcome, verb);
  return result("DONE", { after: ok, detail: ok.with ?? `${verb} done.` });
}

export function completedText(
  ctx: TradeCtx,
  outcome: Extract<TradeState["lastOutcome"], { kind: "completed" }>,
): string {
  const side = (offer: TradeState["ownOffer"]) =>
    offer.items
      .map(
        (item) =>
          `${item.count ?? 1} ${ctx.handle.itemLabel(item.entry ?? 0).name ?? `item ${item.entry ?? 0}`}`,
      )
      .join(", ") || "nothing";
  const withGold = (offer: TradeState["ownOffer"]) =>
    offer.gold > 0 ? `${side(offer)} and ${offer.gold} copper` : side(offer);
  return `Trade completed: you gave ${withGold(outcome.gave)}; you got ${withGold(outcome.got)}.`;
}

export function lastCompletedLine(ctx: TradeCtx): string | undefined {
  const last = ctx.handle.trade.state().lastOutcome;
  if (last?.kind !== "completed") return;
  return completedText(ctx, last).replace(
    "Trade completed: ",
    "Last completed trade: ",
  );
}

export function throwUnlessOpen(ctx: TradeCtx): TradeState {
  const state = ctx.handle.trade.state();
  if (state.phase !== "open")
    throw refusalOf("no_trade", "No trade is open.", tradeNext("show"));
  return state;
}

export function offerLine(
  ctx: TradeCtx,
  offer: TradeState["ownOffer"],
): string {
  const items = offer.items.map(
    (item) =>
      `slot ${item.slot}: ${item.count ?? 1} ${ctx.handle.itemLabel(item.entry ?? 0).name ?? `item ${item.entry ?? 0}`}`,
  );
  return `${items.length === 0 ? "no items" : items.join(", ")}; ${offer.gold} copper`;
}
