import { COMPLAINTS_OPCODES } from "#wow/areas/complaints/opcodes";
import { defineArea, emptyStore } from "#wow/areas/contract";

export const complaintsArea = defineArea({
  name: "complaints",
  opcodes: COMPLAINTS_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
