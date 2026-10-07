import { defineArea, emptyStore } from "#wow/areas/contract";
import { GUARD_OPCODES } from "#wow/areas/guard/opcodes";

export const guardArea = defineArea({
  name: "guard",
  opcodes: GUARD_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
