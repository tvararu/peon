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

type Offered = Extract<ChartersEvent, { type: "signatures" }>;
type Signed = Extract<ChartersEvent, { type: "sign_result" }>;
type Declined = Extract<ChartersEvent, { type: "declined" }>;
type TurnedIn = Extract<ChartersEvent, { type: "turn_in" }>;

function offeredDraft(event: Offered, rc: RuleInput): AreaDraft {
  return {
    class: "wake",
    data: { item: guidText(event.item), signers: event.signers.length },
    guid: guidText(event.item),
    name: "offer",
    ref: rc.refOf(event.item),
    text: `Someone offers a charter with ${event.signers.length} signature${event.signers.length === 1 ? "" : "s"} so far.`,
  };
}

function signedDraft(event: Signed, rc: RuleInput): AreaDraft {
  return {
    class: "passive",
    data: { result: event.result, signer: guidText(event.signer) },
    guid: guidText(event.item),
    name: "signed",
    ref: rc.refOf(event.item),
    text:
      event.result === 0
        ? "The charter gained a signature."
        : `The charter signing failed (${event.result}).`,
  };
}

function declinedDraft(event: Declined, rc: RuleInput): AreaDraft {
  return {
    class: "log",
    data: { signer: guidText(event.signer) },
    guid: event.item === undefined ? undefined : guidText(event.item),
    name: "declined",
    ref: event.item === undefined ? undefined : rc.refOf(event.item),
    text: "The offered charter was declined.",
  };
}

function turnedInDraft(event: TurnedIn): AreaDraft {
  return {
    class: event.code === 0 ? "log" : "wake",
    data: { code: event.code },
    name: "turned_in",
    text:
      event.code === 0
        ? "The charter was turned in."
        : `Turning in the charter failed (${event.code}).`,
  };
}

type Shown = Extract<ChartersEvent, { type: "showlist" }>;
type Counted = Extract<ChartersEvent, { type: "signatures" }>;
type Renamed = Extract<ChartersEvent, { type: "renamed" }>;
type Bought = Extract<ChartersEvent, { type: "bought" }>;

function showlistDraft(event: Shown, rc: RuleInput): AreaDraft {
  return {
    class: "log",
    data: { entries: event.entries.length, npc: guidText(event.npc) },
    guid: guidText(event.npc),
    name: "showlist",
    ref: rc.refOf(event.npc),
    text: offerText(event),
  };
}

function signaturesDraft(event: Counted, rc: RuleInput): AreaDraft {
  return {
    class: "log",
    data: { offered: event.offered, signers: event.signers.length },
    guid: guidText(event.item),
    name: "signatures",
    ref: rc.refOf(event.item),
    text: `The charter has ${event.signers.length} signature${event.signers.length === 1 ? "" : "s"}.`,
  };
}

function renamedDraft(event: Renamed, rc: RuleInput): AreaDraft {
  return {
    class: "log",
    data: { name: event.name },
    guid: guidText(event.item),
    name: "renamed",
    ref: rc.refOf(event.item),
    text: `Renamed the charter to ${event.name}.`,
  };
}

function boughtDraft(event: Bought, rc: RuleInput): AreaDraft {
  return {
    class: "log",
    data: { name: event.name },
    guid: event.item === undefined ? undefined : guidText(event.item),
    name: "bought",
    ref: event.item === undefined ? undefined : rc.refOf(event.item),
    text: `Bought the charter ${event.name}.`,
  };
}

function onEvent(event: ChartersEvent, rc: RuleInput): readonly AreaDraft[] {
  if (event.type === "query") return [];
  if (event.type === "signatures" && event.offered)
    return [offeredDraft(event, rc)];
  if (event.type === "sign_result") return [signedDraft(event, rc)];
  if (event.type === "declined") return [declinedDraft(event, rc)];
  if (event.type === "turn_in") return [turnedInDraft(event)];
  if (event.type === "showlist") return [showlistDraft(event, rc)];
  if (event.type === "signatures") return [signaturesDraft(event, rc)];
  if (event.type === "renamed") return [renamedDraft(event, rc)];
  if (event.type === "bought") return [boughtDraft(event, rc)];
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
  worldActs: [
    "showList",
    "buy",
    "query",
    "showSignatures",
    "rename",
    "offer",
    "sign",
    "decline",
    "turnIn",
  ],
});
