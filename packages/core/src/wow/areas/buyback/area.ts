import { BUYBACK_OPCODES } from "#wow/areas/buyback/opcodes";
import { defineArea, emptyStore } from "#wow/areas/contract";

export const buybackArea = defineArea({
  name: "buyback",
  opcodes: BUYBACK_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
