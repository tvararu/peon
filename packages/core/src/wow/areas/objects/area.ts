import { defineArea, emptyStore } from "#wow/areas/contract";
import { OBJECTS_OPCODES } from "#wow/areas/objects/opcodes";

export const objectsArea = defineArea({
  name: "objects",
  opcodes: OBJECTS_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
