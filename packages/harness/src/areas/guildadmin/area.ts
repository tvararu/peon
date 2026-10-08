import type { AreaEventOf, AreaState } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";

type GuildadminEvent = AreaEventOf<"guildadmin">;

function onEvent(event: GuildadminEvent): readonly AreaDraft[] {
  if (event.type === "tabard_vendor") {
    return [
      {
        class: "log",
        data: {},
        name: "tabard_vendor",
        text: "The tabard designer is open.",
      },
    ];
  }
  if (event.type === "emblem_result") {
    return [
      {
        class: "log",
        data: { code: event.code },
        name: "emblem_result",
        text:
          event.code === 0
            ? "The guild emblem is saved."
            : `The guild emblem was not saved (code ${event.code}).`,
      },
    ];
  }
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
});
