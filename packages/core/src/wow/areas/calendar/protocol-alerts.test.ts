import { describe, expect, test } from "bun:test";
import {
  calendarArenaTeamBody,
  calendarEventInviteBody,
  calendarEventStatusBody,
  calendarFilterGuildBody,
  calendarInviteAlertBody,
  calendarInviteRemovedAlertBody,
  calendarInviteRemovedBody,
  calendarLockoutAddedBody,
  calendarLockoutRemovedBody,
  calendarLockoutUpdatedBody,
  calendarModeratorAlertBody,
  calendarRemovedAlertBody,
  calendarUpdatedAlertBody,
} from "#test-support/areas/calendar";
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
import { PacketReader } from "#wow/protocol/packet";

const JULY = {
  year: 2026,
  month: 7,
  day: 4,
  weekday: 6,
  hour: 12,
  minute: 0,
};
const ZONE = {
  year: 2026,
  month: 7,
  day: 4,
  weekday: 6,
  hour: 19,
  minute: 0,
};

describe("calendar server alerts", () => {
  const creator = 0x0100_0000_0000_0001n;
  const sender = 0x0100_0000_0000_0002n;

  test("SMSG_CALENDAR_FILTER_GUILD lists packed guids (Guilds/Guild.cpp:2201-2229)", () => {
    const parsed = parseCalendarFilterGuild(
      new PacketReader(
        calendarFilterGuildBody({ members: [{ guid: creator }] }),
      ),
    );
    expect(parsed.members).toEqual([{ guid: creator, level: 0 }]);
  });

  test("SMSG_CALENDAR_ARENA_TEAM lists packed guids (Battlegrounds/ArenaTeam.cpp:613-628)", () => {
    const parsed = parseCalendarArenaTeam(
      new PacketReader(calendarArenaTeamBody({ members: [{ guid: creator }] })),
    );
    expect(parsed.members).toEqual([{ guid: creator, unk: 0 }]);
  });

  test("SMSG_CALENDAR_EVENT_INVITE distinguishes sign-ups by the sender flag (Calendar/CalendarMgr.cpp:503-535)", () => {
    const parsed = parseCalendarEventInvite(
      new PacketReader(
        calendarEventInviteBody({
          eventId: 7n,
          invited: false,
          invitee: creator,
          inviteId: 9n,
          level: 80,
          status: 0,
        }),
      ),
    );
    expect(parsed.invited).toBe(false);
    expect(parsed.hasStatusTime).toBe(false);
    expect(parsed.statusTime).toBeUndefined();
    const timed = parseCalendarEventInvite(
      new PacketReader(
        calendarEventInviteBody({
          eventId: 7n,
          invitee: creator,
          inviteId: 9n,
          level: 80,
          status: 1,
          statusTime: JULY,
        }),
      ),
    );
    expect(timed.statusTime).toEqual(JULY);
  });

  test("SMSG_CALENDAR_EVENT_INVITE_REMOVED keeps flags (Calendar/CalendarMgr.cpp:581-590)", () => {
    expect(
      parseCalendarEventInviteRemoved(
        new PacketReader(
          calendarInviteRemovedBody({
            eventId: 7n,
            flags: 1,
            invitee: creator,
          }),
        ),
      ),
    ).toMatchObject({ eventId: 7n, flags: 1, invitee: creator, unk: 1 });
  });

  test("SMSG_CALENDAR_EVENT_STATUS reads the packed invitee and times (Calendar/CalendarMgr.cpp:557-569)", () => {
    expect(
      parseCalendarEventStatus(
        new PacketReader(
          calendarEventStatusBody({
            eventId: 7n,
            flags: 1,
            invitee: creator,
            rank: 1,
            status: 1,
            statusTime: ZONE,
            time: JULY,
          }),
        ),
      ),
    ).toMatchObject({
      eventId: 7n,
      flags: 1,
      invitee: creator,
      rank: 1,
      status: 1,
      statusTime: ZONE,
      time: JULY,
    });
  });

  test("SMSG_CALENDAR_EVENT_INVITE_ALERT reads both guids (Calendar/CalendarMgr.cpp:603-625)", () => {
    expect(
      parseCalendarEventInviteAlert(
        new PacketReader(
          calendarInviteAlertBody({
            creator,
            dungeonId: -1,
            eventId: 7n,
            flags: 0,
            inviteId: 9n,
            rank: 0,
            sender,
            status: 0,
            time: JULY,
            title: "Raid",
            type: 0,
          }),
        ),
      ),
    ).toMatchObject({
      creator,
      dungeonId: -1,
      eventId: 7n,
      inviteId: 9n,
      sender,
      title: "Raid",
    });
  });

  test("SMSG_CALENDAR_EVENT_INVITE_REMOVED_ALERT reads the status (Calendar/CalendarMgr.cpp:673-685)", () => {
    expect(
      parseCalendarEventInviteRemovedAlert(
        new PacketReader(
          calendarInviteRemovedAlertBody({
            eventId: 7n,
            flags: 0,
            status: 9,
            time: JULY,
          }),
        ),
      ),
    ).toMatchObject({ eventId: 7n, status: 9, time: JULY });
  });

  test("SMSG_CALENDAR_EVENT_REMOVED_ALERT reads the flag byte (Calendar/CalendarMgr.cpp:571-579)", () => {
    expect(
      parseCalendarEventRemovedAlert(
        new PacketReader(calendarRemovedAlertBody({ eventId: 7n, time: JULY })),
      ),
    ).toMatchObject({ eventId: 7n, time: JULY, unk: 1 });
  });

  test("SMSG_CALENDAR_EVENT_UPDATED_ALERT keeps the description and the old time (Calendar/CalendarMgr.cpp:537-555)", () => {
    expect(
      parseCalendarEventUpdatedAlert(
        new PacketReader(
          calendarUpdatedAlertBody({
            description: "details",
            dungeonId: -1,
            eventId: 7n,
            flags: 1,
            oldTime: ZONE,
            time: JULY,
            title: "Raid",
            type: 0,
          }),
        ),
      ),
    ).toMatchObject({
      description: "details",
      dungeonId: -1,
      eventId: 7n,
      flags: 1,
      maxInvites: 100,
      oldTime: ZONE,
      repeat: 0,
      time: JULY,
      title: "Raid",
    });
  });

  test("SMSG_CALENDAR_EVENT_MODERATOR_STATUS_ALERT reads the rank (Calendar/CalendarMgr.cpp:592-601)", () => {
    expect(
      parseCalendarModeratorAlert(
        new PacketReader(
          calendarModeratorAlertBody({
            eventId: 7n,
            invitee: creator,
            rank: 1,
          }),
        ),
      ),
    ).toMatchObject({ eventId: 7n, invitee: creator, rank: 1, unk: 1 });
  });

  test("SMSG_CALENDAR_RAID_LOCKOUT_ADDED has the time but SMSG_CALENDAR_RAID_LOCKOUT_REMOVED does not (Handlers/CalendarHandler.cpp:821-838)", () => {
    const added = parseCalendarLockoutAdded(
      new PacketReader(
        calendarLockoutAddedBody({
          difficulty: 1,
          instanceGuid: 99n,
          mapId: 631,
          secondsLeft: 3600,
          time: JULY,
        }),
      ),
    );
    expect(added.time).toEqual(JULY);
    expect(added.mapId).toBe(631);
    const removed = parseCalendarLockoutRemoved(
      new PacketReader(
        calendarLockoutRemovedBody({
          difficulty: 1,
          instanceGuid: 99n,
          mapId: 631,
          secondsLeft: 0,
        }),
      ),
    );
    expect(removed.time).toBeUndefined();
    expect(removed.instanceGuid).toBe(99n);
  });

  test("SMSG_CALENDAR_RAID_LOCKOUT_UPDATED keeps both second counts (Handlers/CalendarHandler.cpp:840-852)", () => {
    expect(
      parseCalendarLockoutUpdated(
        new PacketReader(
          calendarLockoutUpdatedBody({
            difficulty: 1,
            mapId: 631,
            newSeconds: 7200,
            oldSeconds: 3600,
            time: JULY,
          }),
        ),
      ),
    ).toMatchObject({
      difficulty: 1,
      mapId: 631,
      newSeconds: 7200,
      oldSeconds: 3600,
      time: JULY,
    });
  });
});
