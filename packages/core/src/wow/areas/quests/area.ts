import { defineArea, emptyStore } from "#wow/areas/contract";
import { QUESTS_OPCODES } from "#wow/areas/quests/opcodes";

export const questsArea = defineArea({
  name: "quests",
  opcodes: QUESTS_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
