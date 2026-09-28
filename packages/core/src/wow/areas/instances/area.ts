import { defineArea, emptyStore } from "#wow/areas/contract";
import { INSTANCES_OPCODES } from "#wow/areas/instances/opcodes";

export const instancesArea = defineArea({
  name: "instances",
  opcodes: INSTANCES_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
