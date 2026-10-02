import { defineArea, emptyStore } from "#wow/areas/contract";
import { INSPECT_OPCODES } from "#wow/areas/inspect/opcodes";

export const inspectArea = defineArea({
  name: "inspect",
  opcodes: INSPECT_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
