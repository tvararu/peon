import { defineArea, emptyStore } from "#wow/areas/contract";
import { TALENTS_OPCODES } from "#wow/areas/talents/opcodes";

export const talentsArea = defineArea({
  name: "talents",
  opcodes: TALENTS_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
