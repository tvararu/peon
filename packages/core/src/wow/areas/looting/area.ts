import { defineArea, emptyStore } from "#wow/areas/contract";
import { LOOTING_OPCODES } from "#wow/areas/looting/opcodes";

export const lootingArea = defineArea({
  name: "looting",
  opcodes: LOOTING_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
