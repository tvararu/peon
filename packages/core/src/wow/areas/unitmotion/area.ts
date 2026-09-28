import { defineArea, emptyStore } from "#wow/areas/contract";
import { UNITMOTION_OPCODES } from "#wow/areas/unitmotion/opcodes";

export const unitmotionArea = defineArea({
  name: "unitmotion",
  opcodes: UNITMOTION_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
