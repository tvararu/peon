import { COMBATLOG_OPCODES } from "#wow/areas/combatlog/opcodes";
import { defineArea, emptyStore } from "#wow/areas/contract";

export const combatlogArea = defineArea({
  name: "combatlog",
  opcodes: COMBATLOG_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
