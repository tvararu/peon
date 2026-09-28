import { defineHarnessArea } from "#harness/areas/contract";

export const unitmotionHarness = defineHarnessArea({
  area: "unitmotion",
  rules: () => ({ event: () => [] }),
  worldActs: [],
});
