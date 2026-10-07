import { defineArea, emptyStore } from "#wow/areas/contract";
import { WINTERGRASP_OPCODES } from "#wow/areas/wintergrasp/opcodes";

export const wintergraspArea = defineArea({
  name: "wintergrasp",
  opcodes: WINTERGRASP_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
