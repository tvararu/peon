import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import type { RuleInput } from "#harness/events/rules";

type CharacterEvent = AreaEventOf<"character">;

function playedRow(event: CharacterEvent): AreaDraft {
  if (event.type !== "played_time") throw new Error("character_played_expected");
  const total = event.state.played?.totalSeconds ?? 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return {
    class: "log",
    data: { totalSeconds: total },
    name: "played_time",
    text: `Played ${hours}h ${minutes}m in total.`,
  };
}

function onEvent(event: CharacterEvent, _rc: RuleInput): readonly AreaDraft[] {
  if (event.type === "played_time") return [playedRow(event)];
  return [];
}

export const characterHarness = defineHarnessArea({
  area: "character",
  rules: () => ({ event: onEvent }),
  worldActs: [
    "changeFaction",
    "changeRace",
    "customizeCharacter",
    "deleteCharacter",
    "playedTime",
    "renameCharacter",
    "setCloakShown",
    "setHelmShown",
    "setSheathed",
    "styleAtBarber",
    "whois",
  ],
});
