import { defineArea, emptyStore } from "#wow/areas/contract";
import { TRANSPORTS_OPCODES } from "#wow/areas/transports/opcodes";

export const transportsArea = defineArea({
  eventTypes: [],
  name: "transports",
  opcodes: TRANSPORTS_OPCODES,
  register: () => undefined,
  store: () => emptyStore(),
});
