import { CALENDAR_OPCODES } from "#wow/areas/calendar/opcodes";
import { defineArea, emptyStore } from "#wow/areas/contract";

export const calendarArea = defineArea({
  name: "calendar",
  opcodes: CALENDAR_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
