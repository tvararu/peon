import { defineArea, emptyStore } from "#wow/areas/contract";
import { TICKETS_OPCODES } from "#wow/areas/tickets/opcodes";

export const ticketsArea = defineArea({
  name: "tickets",
  opcodes: TICKETS_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
