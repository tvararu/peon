import { AMBIENCE_OPCODES } from "#wow/areas/ambience/opcodes";
import { defineArea, emptyStore } from "#wow/areas/contract";

export const ambienceArea = defineArea({
  name: "ambience",
  opcodes: AMBIENCE_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
