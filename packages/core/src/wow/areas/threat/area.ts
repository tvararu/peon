import { defineArea, emptyStore } from "#wow/areas/contract";
import { THREAT_OPCODES } from "#wow/areas/threat/opcodes";

export const threatArea = defineArea({
  name: "threat",
  opcodes: THREAT_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
