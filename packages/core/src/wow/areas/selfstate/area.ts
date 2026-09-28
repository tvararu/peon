import { defineArea, emptyStore } from "#wow/areas/contract";
import { SELFSTATE_OPCODES } from "#wow/areas/selfstate/opcodes";

export const selfstateArea = defineArea({
  name: "selfstate",
  opcodes: SELFSTATE_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
