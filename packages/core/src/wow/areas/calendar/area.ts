import { CALENDAR_OPCODES } from "#wow/areas/calendar/opcodes";
import {
  parseCalendarCommandResult,
  parseCalendarSendCalendar,
  parseCalendarSendEvent,
  parseCalendarSendNumPending,
} from "#wow/areas/calendar/protocol-read";
import { calendarRuntime } from "#wow/areas/calendar/runtime";
import { CalendarStore } from "#wow/areas/calendar/store";
import { defineArea } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";

export const calendarArea = defineArea({
  eventTypes: ["calendar", "event", "pending", "command_result"],
  name: "calendar",
  opcodes: CALENDAR_OPCODES,
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_CALENDAR_SEND_CALENDAR, (reader) => {
      store.receiveCalendar(parseCalendarSendCalendar(reader));
    });
    wire.on(GameOpcode.SMSG_CALENDAR_SEND_EVENT, (reader) => {
      store.receiveEvent(parseCalendarSendEvent(reader));
    });
    wire.on(GameOpcode.SMSG_CALENDAR_SEND_NUM_PENDING, (reader) => {
      store.receiveNumPending(parseCalendarSendNumPending(reader).pending);
    });
    wire.on(GameOpcode.SMSG_CALENDAR_COMMAND_RESULT, (reader) => {
      const parsed = parseCalendarCommandResult(reader);
      store.receiveCommandResult(parsed.error, parsed.name);
    });
  },
  runtime: calendarRuntime,
  store: (deps) => new CalendarStore(deps.now),
});
