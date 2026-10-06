import { defineHarnessArea } from "#harness/areas/contract";

export const characterHarness = defineHarnessArea({
  area: "character",
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
