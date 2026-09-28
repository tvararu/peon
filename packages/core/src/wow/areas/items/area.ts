import { defineArea, emptyStore } from "#wow/areas/contract";
import { ITEMS_OPCODES } from "#wow/areas/items/opcodes";

export const itemsArea = defineArea({
  name: "items",
  opcodes: ITEMS_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
