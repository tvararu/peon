import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import { guidText, type RuleInput } from "#harness/events/rules";

type BankEvent = AreaEventOf<"bank">;
type Moved = Extract<BankEvent, { type: "moved" }>;

function itemName(entry: number | undefined, rc: RuleInput): string {
  if (entry === undefined) return "an item";
  return rc.lookup.itemName(entry) ?? `item ${entry}`;
}

function movedRow(event: Moved, rc: RuleInput): AreaDraft {
  const name = itemName(event.entry, rc);
  const verb = event.kind === "deposit" ? "Deposited" : "Withdrew";
  return {
    class: "log",
    data: { entry: event.entry, guid: guidText(event.guid) },
    guid: guidText(event.guid),
    name: event.kind === "deposit" ? "deposit" : "withdraw",
    ref: rc.refOf(event.guid),
    text: `${verb} ${name}.`,
  };
}

function onEvent(event: BankEvent, rc: RuleInput): readonly AreaDraft[] {
  if (event.type === "opened")
    return [
      {
        class: "log",
        data: { banker: guidText(event.banker) },
        guid: guidText(event.banker),
        name: "opened",
        ref: rc.refOf(event.banker),
        text: "Opened the bank.",
      },
    ];
  if (event.type === "moved") return [movedRow(event, rc)];
  if (event.type === "slot_bought")
    return [
      {
        class: "log",
        data: { result: event.result },
        name: "slot",
        text: `Bought a bank bag slot (${event.result}).`,
      },
    ];
  if (event.type === "refused")
    return [
      {
        class: "wake",
        data: { kind: event.kind, reason: event.reason },
        name: "refused",
        text: `The bank ${event.kind} was refused (${event.reason}).`,
      },
    ];
  return [
    {
      class: "wake",
      data: { kind: event.kind },
      name: event.type === "no_change" ? "no_change" : "unanswered",
      text:
        event.type === "no_change"
          ? `The bank ${event.kind} changed nothing.`
          : `The bank ${event.kind} went unanswered.`,
    },
  ];
}

export const bankHarness = defineHarnessArea({
  area: "bank",
  rules: () => ({ event: (event, rc) => onEvent(event, rc) }),
});
