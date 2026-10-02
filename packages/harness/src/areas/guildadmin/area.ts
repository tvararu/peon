import type { AreaEventOf, AreaState } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";

type GuildadminEvent = AreaEventOf<"guildadmin">;

function onEvent(event: GuildadminEvent): readonly AreaDraft[] {
  if (event.type !== "disbanded") return [];
  return [
    {
      class: "wake",
      data: { disbanded: true },
      name: "disbanded",
      text: "The guild is disbanded.",
    },
  ];
}

function onAttach(_state: AreaState<"guildadmin">): readonly AreaDraft[] {
  return [];
}

export const guildadminHarness = defineHarnessArea({
  area: "guildadmin",
  rules: () => ({ attach: onAttach, event: onEvent }),
  worldActs: ["info", "disband"],
});
