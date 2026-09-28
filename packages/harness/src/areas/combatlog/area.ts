import { defineHarnessArea } from "#harness/areas/contract";

export const combatlogHarness = defineHarnessArea({
  area: "combatlog",
  rules: () => ({ event: () => [] }),
  worldActs: [],
});
