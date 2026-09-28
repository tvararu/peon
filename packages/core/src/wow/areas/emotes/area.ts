import { defineArea, emptyStore } from "#wow/areas/contract";
import { EMOTES_OPCODES } from "#wow/areas/emotes/opcodes";

export const emotesArea = defineArea({
  name: "emotes",
  opcodes: EMOTES_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
