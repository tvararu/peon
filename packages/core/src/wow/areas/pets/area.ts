import { defineArea, emptyStore } from "#wow/areas/contract";
import { PETS_OPCODES } from "#wow/areas/pets/opcodes";

export const petsArea = defineArea({
  name: "pets",
  opcodes: PETS_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
