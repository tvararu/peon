import { ACCOUNT_OPCODES } from "#wow/areas/account/opcodes";
import { defineArea, emptyStore } from "#wow/areas/contract";

export const accountArea = defineArea({
  name: "account",
  opcodes: ACCOUNT_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
