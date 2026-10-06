import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import { guidText, type RuleInput } from "#harness/events/rules";

type GuildBankEvent = AreaEventOf<"guildbank">;

function itemName(entry: number | undefined, rc: RuleInput): string {
  if (entry === undefined) return "an item";
  return rc.lookup.itemName(entry) ?? `item ${entry}`;
}

function onEvent(event: GuildBankEvent, rc: RuleInput): readonly AreaDraft[] {
  if (event.type === "opened")
    return [
      {
        class: "log",
        data: { tabs: event.tabs, vault: guidText(event.vault) },
        guid: guidText(event.vault),
        name: "opened",
        ref: rc.refOf(event.vault),
        text: `Opened the guild vault (${event.tabs} tab${event.tabs === 1 ? "" : "s"}).`,
      },
    ];
  if (event.type === "tab")
    return [
      {
        class: "log",
        data: { full: event.full, tab: event.tab },
        name: "tab",
        text: `Guild bank tab ${event.tab} arrived.`,
      },
    ];
  if (event.type === "tab_bought")
    return [
      {
        class: "log",
        data: { tab: event.tab, tabs: event.tabs },
        name: "tab_bought",
        text: `Bought guild bank tab ${event.tab} (${event.tabs} tabs now).`,
      },
    ];
  if (event.type === "tab_renamed")
    return [
      {
        class: "log",
        data: { tab: event.tab },
        name: "tab_renamed",
        text: `Renamed guild bank tab ${event.tab}.`,
      },
    ];
  if (event.type === "money_moved")
    return [
      {
        class: "log",
        data: { copper: event.copper, money: event.money.toString(10) },
        name: "money_moved",
        text: `Moved ${event.copper} copper; the vault holds ${event.money} copper.`,
      },
    ];
  if (event.type === "moved")
    return [
      {
        class: "log",
        data: { slot: event.slot, tab: event.tab },
        name: "moved",
        text: `Moved a guild bank item in tab ${event.tab} slot ${event.slot}.`,
      },
    ];
  if (event.type === "text_set")
    return [
      {
        class: "log",
        data: { tab: event.tab },
        name: "text_set",
        text: `Guild bank tab ${event.tab} text: ${event.text}`,
      },
    ];
  if (event.type === "logged")
    return [
      {
        class: "log",
        data: { tab: event.tab },
        name: "logged",
        text: `Guild bank log for tab ${event.tab} arrived.`,
      },
    ];
  if (event.type === "money_queried")
    return [
      {
        class: "log",
        data: { remaining: event.remaining },
        name: "money_queried",
        text:
          event.remaining < 0
            ? "Daily guild bank withdrawals are unlimited."
            : `${event.remaining} copper left to withdraw today.`,
      },
    ];
  if (event.type === "refused")
    return [
      {
        class: "wake",
        data: { kind: event.kind, reason: event.reason },
        name: "refused",
        text: `The guild bank ${event.kind} was refused (${event.reason}).`,
      },
    ];
  return [
    {
      class: "wake",
      data: { kind: event.kind },
      name: event.type === "no_change" ? "no_change" : "unanswered",
      text:
        event.type === "no_change"
          ? `The guild bank ${event.kind} changed nothing.`
          : `The guild bank ${event.kind} went unanswered.`,
    },
  ];
}

export function movedItemName(
  entry: number | undefined,
  rc: RuleInput,
): string {
  return itemName(entry, rc);
}

export const guildbankHarness = defineHarnessArea({
  area: "guildbank",
  rules: () => ({ event: (event, rc) => onEvent(event, rc) }),
  worldActs: [
    "openVault",
    "queryTab",
    "buyTab",
    "renameTab",
    "depositMoney",
    "withdrawMoney",
    "depositItem",
    "withdrawItem",
    "moveWithinBank",
    "setTabText",
    "queryLog",
    "queryText",
    "queryMoneyWithdrawn",
  ],
});
