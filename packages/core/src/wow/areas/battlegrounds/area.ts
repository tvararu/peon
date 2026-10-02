import { BATTLEGROUNDS_OPCODES } from "#wow/areas/battlegrounds/opcodes";
import { defineArea, emptyStore } from "#wow/areas/contract";

export const battlegroundsArea = defineArea({
  name: "battlegrounds",
  opcodes: BATTLEGROUNDS_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
