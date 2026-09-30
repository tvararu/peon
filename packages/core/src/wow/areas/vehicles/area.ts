import { defineArea, emptyStore } from "#wow/areas/contract";
import { VEHICLES_OPCODES } from "#wow/areas/vehicles/opcodes";

export const vehiclesArea = defineArea({
  eventTypes: [],
  name: "vehicles",
  opcodes: VEHICLES_OPCODES,
  register: () => undefined,
  store: () => emptyStore(),
});
