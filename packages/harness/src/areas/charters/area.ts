import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import { guidText, type RuleInput } from "#harness/events/rules";

type ChartersEvent = AreaEventOf<"charters">;
type Listed = Extract<ChartersEvent, { type: "showlist" }>;

const GUILD_CHARTER_ENTRY = 5863;

function offerText(event: Listed): string {
  const guild =
    event.entries.find((entry) => entry.entry === GUILD_CHARTER_ENTRY) ??
    event.entries[0];
  if (!guild) return "The petitioner offers no charters.";
  return (
    `The petitioner offers ${event.entries.length} charter` +
    `${event.entries.length === 1 ? "" : "s"}: a guild charter costs ` +
    `${guild.cost} copper and needs ${guild.required} signatures.`
  );
}

function onEvent(
  event: ChartersEvent,
  rc: RuleInput,
): readonly AreaDraft[] {
  if (event.type === "query") return [];
  if (event.type === "showlist")
    return [
      {
        class: "log",
        data: { entries: event.entries.length, npc: guidText(event.npc) },
        guid: guidText(event.npc),
        name: "showlist",
        ref: rc.refOf(event.npc),
        text: offerText(event),
      },
    ];
  if (event.type === "signatures")
    return [
      {
        class: "log",
        data: { offered: event.offered, signers: event.signers.length },
        guid: guidText(event.item),
        name: "signatures",
        ref: rc.refOf(event.item),
        text: `The charter has ${event.signers.length} signature${event.signers.length === 1 ? "" : "s"}.`,
      },
    ];
  if (event.type === "renamed")
    return [
      {
        class: "log",
        data: { name: event.name },
        guid: guidText(event.item),
        name: "renamed",
        ref: rc.refOf(event.item),
        text: `Renamed the charter to ${event.name}.`,
      },
    ];
  if (event.type === "bought")
    return [
      {
        class: "log",
        data: { name: event.name },
        guid: event.item === undefined ? undefined : guidText(event.item),
        name: "bought",
        ref: event.item === undefined ? undefined : rc.refOf(event.item),
        text: `Bought the charter ${event.name}.`,
      },
    ];
  if (event.type === "refused")
    return [
      {
        class: "wake",
        data: { kind: event.kind, reason: event.reason },
        name: "refused",
        text: `The charter ${event.kind} was refused (${event.reason}).`,
      },
    ];
  return [
    {
      class: "wake",
      data: { kind: event.kind },
      name: "unanswered",
      text: `The charter ${event.kind} went unanswered.`,
    },
  ];
}

export const chartersHarness = defineHarnessArea({
  area: "charters",
  rules: () => ({ event: (event, rc) => onEvent(event, rc) }),
  worldActs: ["showList", "buy", "query", "showSignatures", "rename"],
});
