import { defineArea, emptyStore } from "#wow/areas/contract";
import { SPELLS_OPCODES } from "#wow/areas/spells/opcodes";

export const spellsArea = defineArea({
  name: "spells",
  opcodes: SPELLS_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
