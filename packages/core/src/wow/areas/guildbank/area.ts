import { defineArea, emptyStore } from "#wow/areas/contract";
import { GUILDBANK_OPCODES } from "#wow/areas/guildbank/opcodes";

export const guildbankArea = defineArea({
  name: "guildbank",
  opcodes: GUILDBANK_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
