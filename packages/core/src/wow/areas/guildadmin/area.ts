import { defineArea, emptyStore } from "#wow/areas/contract";
import { GUILDADMIN_OPCODES } from "#wow/areas/guildadmin/opcodes";

export const guildadminArea = defineArea({
  name: "guildadmin",
  opcodes: GUILDADMIN_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
