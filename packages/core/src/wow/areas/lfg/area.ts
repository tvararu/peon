import { defineArea, emptyStore } from "#wow/areas/contract";
import { LFG_OPCODES } from "#wow/areas/lfg/opcodes";

export const lfgArea = defineArea({
  name: "lfg",
  opcodes: LFG_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
