import { CALENDAR_OPCODES } from "#wow/areas/calendar/opcodes";
import {
  parseCalendarCommandResult,
  parseCalendarSendCalendar,
  parseCalendarSendEvent,
  parseCalendarSendNumPending,
} from "#wow/areas/calendar/protocol-read";
import {
  parseCalendarArenaTeam,
  parseCalendarEventInvite,
  parseCalendarEventInviteAlert,
  parseCalendarEventInviteRemoved,
  parseCalendarEventInviteRemovedAlert,
  parseCalendarEventRemovedAlert,
  parseCalendarEventStatus,
  parseCalendarEventUpdatedAlert,
  parseCalendarFilterGuild,
  parseCalendarLockoutAdded,
  parseCalendarLockoutRemoved,
  parseCalendarLockoutUpdated,
  parseCalendarModeratorAlert,
} from "#wow/areas/calendar/protocol-server";
import { calendarRuntime } from "#wow/areas/calendar/runtime";
import { CalendarStore } from "#wow/areas/calendar/store";
import { defineArea } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";

export const calendarArea = defineArea({
  eventTypes: [
    "calendar",
    "event",
    "pending",
    "command_result",
    "invite",
    "invite_removed",
    "invite_alert",
    "status",
    "removed_alert",
    "updated_alert",
    "moderator_alert",
    "filter_guild",
    "arena_team",
    "lockout_added",
    "lockout_removed",
    "lockout_updated",
    "clear_pending",
  ],
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
    wire.on(GameOpcode.SMSG_CALENDAR_EVENT_INVITE, (reader) => {
      store.receiveInvite(parseCalendarEventInvite(reader), store.selfGuid());
    });
    wire.on(GameOpcode.SMSG_CALENDAR_EVENT_INVITE_REMOVED, (reader) => {
      const parsed = parseCalendarEventInviteRemoved(reader);
      store.receiveInviteRemoved({
        eventId: parsed.eventId,
        invitee: parsed.invitee,
      });
    });
    wire.on(GameOpcode.SMSG_CALENDAR_EVENT_STATUS, (reader) => {
      store.receiveStatus(parseCalendarEventStatus(reader));
    });
    wire.on(GameOpcode.SMSG_CALENDAR_EVENT_INVITE_ALERT, (reader) => {
      store.receiveEventInviteAlert(parseCalendarEventInviteAlert(reader));
    });
    wire.on(GameOpcode.SMSG_CALENDAR_EVENT_INVITE_REMOVED_ALERT, (reader) => {
      const parsed = parseCalendarEventInviteRemovedAlert(reader);
      store.receiveInviteRemoved({
        eventId: parsed.eventId,
        invitee: store.selfGuid(),
      });
    });
    wire.on(GameOpcode.SMSG_CALENDAR_EVENT_REMOVED_ALERT, (reader) => {
      store.receiveRemovedAlert(
        parseCalendarEventRemovedAlert(reader).eventId,
      );
    });
    wire.on(GameOpcode.SMSG_CALENDAR_EVENT_UPDATED_ALERT, (reader) => {
      store.receiveUpdatedAlert(parseCalendarEventUpdatedAlert(reader));
    });
    wire.on(GameOpcode.SMSG_CALENDAR_EVENT_MODERATOR_STATUS_ALERT, (reader) => {
      const parsed = parseCalendarModeratorAlert(reader);
      store.receiveModeratorAlert(parsed.eventId, parsed.invitee, parsed.rank);
    });
    wire.on(GameOpcode.SMSG_CALENDAR_FILTER_GUILD, (reader) => {
      store.receiveFilterGuild(parseCalendarFilterGuild(reader).members);
    });
    wire.on(GameOpcode.SMSG_CALENDAR_ARENA_TEAM, (reader) => {
      store.receiveArenaTeam(parseCalendarArenaTeam(reader).members);
    });
    wire.on(GameOpcode.SMSG_CALENDAR_RAID_LOCKOUT_ADDED, (reader) => {
      store.receiveLockoutAdded(parseCalendarLockoutAdded(reader));
    });
    wire.on(GameOpcode.SMSG_CALENDAR_RAID_LOCKOUT_REMOVED, (reader) => {
      store.receiveLockoutRemoved(parseCalendarLockoutRemoved(reader));
    });
    wire.on(GameOpcode.SMSG_CALENDAR_RAID_LOCKOUT_UPDATED, (reader) => {
      store.receiveLockoutUpdated(parseCalendarLockoutUpdated(reader));
    });
    wire.on(GameOpcode.SMSG_CALENDAR_CLEAR_PENDING_ACTION, () => {
      store.receiveClearPending();
    });
  },
  runtime: calendarRuntime,
  store: (deps) => new CalendarStore(deps.now, deps.selfGuid),
});
