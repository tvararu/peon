import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import { guidText, type RuleInput } from "#harness/events/rules";

type GuildBankEvent = AreaEventOf<"guildbank">;
type Draft = Omit<AreaDraft, "class" | "name">;
type Drafts = {
  [K in GuildBankEvent["type"]]: (
    event: Extract<GuildBankEvent, { type: K }>,
    rc: RuleInput,
  ) => Draft;
};

const WAKES: ReadonlySet<GuildBankEvent["type"]> = new Set([
  "refused",
  "no_change",
  "unanswered",
]);

const DRAFTS: Drafts = {
  logged: (event) => ({
    data: { tab: event.tab },
    text: `Guild bank log for tab ${event.tab} arrived.`,
  }),
  money_moved: (event) => ({
    data: { copper: event.copper, money: event.money.toString(10) },
    text: `Moved ${event.copper} copper; the vault holds ${event.money} copper.`,
  }),
  money_queried: (event) => ({
    data: { remaining: event.remaining },
    text:
      event.remaining < 0
        ? "Daily guild bank withdrawals are unlimited."
        : `${event.remaining} copper left to withdraw today.`,
  }),
  moved: (event) => ({
    data: { slot: event.slot, tab: event.tab },
    text: `Moved a guild bank item in tab ${event.tab} slot ${event.slot}.`,
  }),
  no_change: (event) => ({
    data: { kind: event.kind },
    text: `The guild bank ${event.kind} changed nothing.`,
  }),
  opened: (event, rc) => ({
    data: { tabs: event.tabs, vault: guidText(event.vault) },
    guid: guidText(event.vault),
    ref: rc.refOf(event.vault),
    text: `Opened the guild vault (${event.tabs} tab${event.tabs === 1 ? "" : "s"}).`,
  }),
  refused: (event) => ({
    data: { kind: event.kind, reason: event.reason },
    text: `The guild bank ${event.kind} was refused (${event.reason}).`,
  }),
  tab: (event) => ({
    data: { full: event.full, tab: event.tab },
    text: `Guild bank tab ${event.tab} arrived.`,
  }),
  tab_bought: (event) => ({
    data: { tab: event.tab, tabs: event.tabs },
    text: `Bought guild bank tab ${event.tab} (${event.tabs} tabs now).`,
  }),
  tab_renamed: (event) => ({
    data: { tab: event.tab },
    text: `Renamed guild bank tab ${event.tab}.`,
  }),
  text_set: (event) => ({
    data: { tab: event.tab },
    text: `Guild bank tab ${event.tab} text: ${event.text}`,
  }),
  unanswered: (event) => ({
    data: { kind: event.kind },
    text: `The guild bank ${event.kind} went unanswered.`,
  }),
};

function onEvent(event: GuildBankEvent, rc: RuleInput): readonly AreaDraft[] {
  const build = DRAFTS[event.type] as (
    event: GuildBankEvent,
    rc: RuleInput,
  ) => Draft;
  return [
    {
      class: WAKES.has(event.type) ? "wake" : "log",
      name: event.type,
      ...build(event, rc),
    },
  ];
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
