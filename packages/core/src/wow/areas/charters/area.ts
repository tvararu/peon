import { CHARTERS_OPCODES } from "#wow/areas/charters/opcodes";
import { defineArea, emptyStore } from "#wow/areas/contract";

export const chartersArea = defineArea({
  name: "charters",
  opcodes: CHARTERS_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
