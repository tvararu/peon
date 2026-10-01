import { BANK_OPCODES } from "#wow/areas/bank/opcodes";
import { defineArea, emptyStore } from "#wow/areas/contract";

export const bankArea = defineArea({
  name: "bank",
  opcodes: BANK_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
