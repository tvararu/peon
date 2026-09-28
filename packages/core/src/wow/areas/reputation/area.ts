import { defineArea, emptyStore } from "#wow/areas/contract";
import { REPUTATION_OPCODES } from "#wow/areas/reputation/opcodes";

export const reputationArea = defineArea({
  name: "reputation",
  opcodes: REPUTATION_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
