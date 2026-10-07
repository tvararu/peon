import { describe, expect, test } from "bun:test";
import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { ticketsHarness } from "#harness/areas/tickets/area";
import type { RuleInput } from "#harness/events/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

type TicketsEvent = AreaEventOf<"tickets">;

function rules() {
  const event = ticketsHarness.rules?.().event;
  if (!event) throw new Error("tickets has no event rule");
  return (
    e: TicketsEvent,
    rc: RuleInput = testRuleInput(),
  ): readonly AreaDraft[] => event(e, rc);
}

describe("tickets/gm_reply", () => {
  test("a gm answer wakes the agent with the text", () => {
    expect(
      rules()({
        text: "your corpse is safe",
        ticketId: 7,
        type: "gm_response",
      }),
    ).toEqual([
      {
        class: "wake",
        data: { ticketId: 7 },
        name: "gm_reply",
        text: "A GM answered your ticket: your corpse is safe",
      },
    ]);
  });

  test("other ticket events return no rows", () => {
    expect(rules()({ offered: true, type: "gm_survey" })).toEqual([]);
    expect(
      rules()({
        ticket: { status: "none" },
        type: "ticket",
      }),
    ).toEqual([]);
  });
});
