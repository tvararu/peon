import { CHARACTER_OPCODES } from "#wow/areas/character/opcodes";
import { defineArea, emptyStore } from "#wow/areas/contract";

export const characterArea = defineArea({
  name: "character",
  opcodes: CHARACTER_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
