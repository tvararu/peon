import { ACHIEVEMENTS_OPCODES } from "#wow/areas/achievements/opcodes";
import { defineArea, emptyStore } from "#wow/areas/contract";

export const achievementsArea = defineArea({
  name: "achievements",
  opcodes: ACHIEVEMENTS_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
