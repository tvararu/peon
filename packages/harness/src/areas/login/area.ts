import { defineHarnessArea } from "#harness/areas/contract";

export const loginHarness = defineHarnessArea({
  area: "login",
  rules: () => ({ event: () => [] }),
});
