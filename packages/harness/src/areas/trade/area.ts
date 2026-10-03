import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import { guidText, type RuleInput } from "#harness/events/rules";

type TradeEvent = AreaEventOf<"trade">;
type Completed = Extract<TradeEvent, { type: "completed" }>;
type OfferLine = { gold: string; items: string };
type Settled = "canceled" | "refused";
const TRADED_SLOTS = 6;

function player(guid: bigint, rc: RuleInput): string {
  return rc.lookup.unitName(guid) ?? `player ${guidText(guid)}`;
}

function itemName(entry: number | undefined, rc: RuleInput): string {
  if (entry === undefined) return "an item";
  return rc.lookup.itemName(entry) ?? `item ${entry}`;
}

function line(offer: Completed["gave"], rc: RuleInput): OfferLine {
  const movedItems = offer.items.filter((item) => item.slot < TRADED_SLOTS);
  const items =
    movedItems.length === 0
      ? "no items"
      : movedItems
          .map((item) => `${item.count ?? 1} ${itemName(item.entry, rc)}`)
          .join(", ");
  return {
    gold: offer.gold > 0 ? `${offer.gold} copper` : "no gold",
    items,
  };
}

function completedRow(event: Completed, rc: RuleInput): AreaDraft {
  const gave = line(event.gave, rc);
  const got = line(event.got, rc);
  return {
    class: "log",
    data: {
      gaveGold: event.gave.gold,
      gaveItems: event.gave.items.length,
      gotGold: event.got.gold,
      gotItems: event.got.items.length,
    },
    name: "completed",
    progress: true,
    text: `You gave ${gave.items} and ${gave.gold}; you got ${got.items} and ${got.gold}.`,
  };
}

function requestedRow(event: TradeEvent, rc: RuleInput): AreaDraft {
  if (event.type !== "requested") throw new Error("trade_requested_expected");
  return {
    class: "wake",
    data: { from: guidText(event.from) },
    guid: guidText(event.from),
    name: "requested",
    ref: rc.refOf(event.from),
    text: `${player(event.from, rc)} wants to trade with you.`,
  };
}

function openedRow(event: TradeEvent, rc: RuleInput): AreaDraft {
  if (event.type !== "opened") throw new Error("trade_opened_expected");
  return {
    class: "log",
    data: { with: guidText(event.with) },
    guid: guidText(event.with),
    name: "opened",
    ref: rc.refOf(event.with),
    text: `The trade with ${player(event.with, rc)} opened.`,
  };
}

function changedRow(event: TradeEvent): AreaDraft {
  if (event.type !== "offer_changed") throw new Error("trade_changed_expected");
  return {
    class: "log",
    data: { version: event.version },
    name: "offer_changed",
    text: `Their offer changed (version ${event.version}).`,
  };
}

function settledRow(status: string, name: Settled): AreaDraft {
  const verb = name === "canceled" ? "canceled" : "refused";
  return {
    class: "wake",
    data: { status },
    name,
    text: `The trade was ${verb} (${status}).`,
  };
}

function settledDraft(event: TradeEvent, rc: RuleInput): AreaDraft | [] {
  if (event.type === "canceled") return settledRow(event.status, "canceled");
  if (event.type === "refused") return settledRow(event.status, "refused");
  if (event.type === "completed") return completedRow(event, rc);
  if (event.type === "they_accepted")
    return {
      class: "wake",
      data: {},
      name: "they_accepted",
      text: "They accepted the trade.",
    };
  if (event.type === "unanswered")
    return {
      class: "wake",
      data: {},
      name: "unanswered",
      text: "The trade went unanswered.",
    };
  return [];
}

function windowDraft(event: TradeEvent, rc: RuleInput): AreaDraft | [] {
  if (event.type === "requested") return requestedRow(event, rc);
  if (event.type === "opened") return openedRow(event, rc);
  if (event.type === "offer_changed") return changedRow(event);
  return [];
}

function onEvent(event: TradeEvent, rc: RuleInput): readonly AreaDraft[] {
  const first = windowDraft(event, rc);
  if (first !== undefined && !Array.isArray(first)) return [first];
  const second = settledDraft(event, rc);
  if (!Array.isArray(second)) return [second];
  return [];
}

export const tradeHarness = defineHarnessArea({
  area: "trade",
  rules: () => ({ event: onEvent }),
  worldActs: [
    "acceptTrade",
    "answerTrade",
    "cancelTrade",
    "offerGold",
    "offerItem",
    "requestTrade",
    "unacceptTrade",
    "withdrawItem",
  ],
});
