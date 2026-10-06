import { ARENA_OPCODES } from "#wow/areas/arena/opcodes";
import { defineArea, emptyStore } from "#wow/areas/contract";

export const arenaArea = defineArea({
  name: "arena",
  opcodes: ARENA_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
