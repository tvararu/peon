import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import type { RuleInput } from "#harness/events/rules";

function onEvent(
  event: AreaEventOf<"guard">,
  _rc: RuleInput,
): readonly AreaDraft[] {
  if (event.type !== "warden_request") return [];
  return [
    {
      class: "log",
      data: { size: event.size },
      name: "warden",
      text: "The server asked for the anti-cheat module. Peon does not answer it.",
    },
  ];
}

export const guardHarness = defineHarnessArea({
  area: "guard",
  rules: () => ({ event: onEvent }),
});
