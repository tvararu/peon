import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import type { RuleInput } from "#harness/events/rules";

type TicketsEvent = AreaEventOf<"tickets">;

function gmReplyRow(ticketId: number, text: string): AreaDraft {
  return {
    class: "wake",
    data: { ticketId },
    name: "gm_reply",
    text: `A GM answered your ticket: ${text}`,
  };
}

function onEvent(event: TicketsEvent, _rc: RuleInput): readonly AreaDraft[] {
  if (event.type === "gm_response")
    return [gmReplyRow(event.ticketId, event.text)];
  return [];
}

export const ticketsHarness = defineHarnessArea({
  area: "tickets",
  rules: () => ({ event: (event, rc) => onEvent(event, rc) }),
});
