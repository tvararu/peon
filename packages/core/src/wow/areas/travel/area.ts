import { defineArea, emptyStore } from "#wow/areas/contract";
import { TRAVEL_OPCODES } from "#wow/areas/travel/opcodes";

export const travelArea = defineArea({
  name: "travel",
  opcodes: TRAVEL_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
