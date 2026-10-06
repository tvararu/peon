import { describe, expect, test } from "bun:test";
import {
  type CalendarSendCalendarInit,
  calendarArenaTeamBody,
  calendarCommandResultBody,
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
  calendarNumPendingBody,
  calendarRemovedAlertBody,
  calendarSendCalendarBody,
  calendarSendEventBody,
  calendarUpdatedAlertBody,
  packCalendarTime,
} from "#test-support/areas/calendar";
import {
  CALENDAR_HOLIDAY_DATES,
  CALENDAR_HOLIDAY_DURATIONS,
  CALENDAR_HOLIDAY_FLAGS,
  parseCalendarCommandResult,
  parseCalendarSendCalendar,
  parseCalendarSendEvent,
  parseCalendarSendNumPending,
} from "#wow/areas/calendar/protocol-read";
import {
  CalendarFlag,
  buildAddEvent,
  buildArenaTeam,
  buildComplain,
  buildCopyEvent,
  buildEventInvite,
  buildEventRsvp,
  buildEventSignup,
  buildEventStatus,
  buildGuildFilter,
  buildModeratorStatus,
  buildRemoveEvent,
  buildRemoveInvite,
  buildUpdateEvent,
} from "#wow/areas/calendar/protocol";
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

function minimal(init?: Partial<CalendarSendCalendarInit>) {
  return calendarSendCalendarBody({ serverTime: 1, zoneTime: ZONE, ...init });
}

describe("calendar read parsers", () => {
  test("an empty calendar reply reads no rows with zero server time", () => {
    const parsed = parseCalendarSendCalendar(
      new PacketReader(minimal({ serverTime: 0 })),
    );
    expect(parsed.serverTime).toBe(0);
    expect(parsed.invites).toEqual([]);
    expect(parsed.events).toEqual([]);
    expect(parsed.binds).toEqual([]);
    expect(parsed.resets).toEqual([]);
    expect(parsed.holidays).toEqual([]);
    expect(parsed.relationTime).toBe(0);
    expect(parsed.zoneTime).toEqual(ZONE);
  });

  test("SMSG_CALENDAR_SEND_CALENDAR carries the invite and event lists (Handlers/CalendarHandler.cpp:64-96)", () => {
    const parsed = parseCalendarSendCalendar(
      new PacketReader(
        minimal({
          events: [
            {
              creator: 0x0100_0000_0000_0001n,
              dungeonId: -1,
              flags: 0,
              id: 7n,
              time: JULY,
              title: "Raid",
              type: 0,
            },
          ],
          invites: [
            {
              creator: 0x0100_0000_0000_0002n,
              eventId: 7n,
              guildEvent: true,
              inviteId: 9n,
              rank: 4,
              status: 0,
            },
          ],
          serverTime: 1_790_000_000,
        }),
      ),
    );
    expect(parsed.serverTime).toBe(1_790_000_000);
    expect(parsed.invites.map((i) => i.inviteId)).toEqual([9n]);
    expect(parsed.events.map((e) => e.title)).toEqual(["Raid"]);
    expect(parsed.events[0]?.creator).toBe(0x0100_0000_0000_0001n);
  });

  test("SMSG_CALENDAR_SEND_CALENDAR carries binds, resets and the relation time (Handlers/CalendarHandler.cpp:101-154)", () => {
    const parsed = parseCalendarSendCalendar(
      new PacketReader(
        minimal({
          binds: [
            {
              difficulty: 1,
              instanceGuid: 99n,
              mapId: 631,
              secondsLeft: 3600,
            },
          ],
          relationTime: 12_345,
          resets: [{ mapId: 631, offset: 0, period: 604_800 }],
        }),
      ),
    );
    expect(parsed.binds.map((b) => b.mapId)).toEqual([631]);
    expect(parsed.binds[0]?.instanceGuid).toBe(99n);
    expect(parsed.resets).toEqual([{ mapId: 631, offset: 0, period: 604_800 }]);
    expect(parsed.relationTime).toBe(12_345);
  });

  test("SMSG_CALENDAR_SEND_CALENDAR carries holidays with 26 dates, 10 durations and 10 flags (Handlers/CalendarHandler.cpp:156-190)", () => {
    const dates = Array.from({ length: 26 }, (_, i) => i + 1);
    const durations = Array.from({ length: 10 }, (_, i) => 100 + i);
    const flags = Array.from({ length: 10 }, (_, i) => 200 + i);
    const parsed = parseCalendarSendCalendar(
      new PacketReader(
        minimal({
          holidays: [
            {
              dates: [],
              durations: [],
              filterType: 0,
              flags: [],
              id: 62,
              looping: 1,
              priority: 0,
              region: 0,
              texture: "",
            },
            {
              dates,
              durations,
              filterType: 3,
              flags,
              id: 1,
              looping: 0,
              priority: 2,
              region: 1,
              texture: "Calendar_DayofDead",
            },
          ],
        }),
      ),
    );
    expect(parsed.holidays).toHaveLength(2);
    expect(parsed.holidays[1]).toMatchObject({
      dates,
      durations,
      flags,
      id: 1,
      priority: 2,
      region: 1,
      texture: "Calendar_DayofDead",
    });
    expect(parsed.holidays[1]?.dates).toHaveLength(CALENDAR_HOLIDAY_DATES);
    expect(parsed.holidays[1]?.durations).toHaveLength(
      CALENDAR_HOLIDAY_DURATIONS,
    );
    expect(parsed.holidays[1]?.flags).toHaveLength(CALENDAR_HOLIDAY_FLAGS);
  });

  test("a short send-calendar body throws", () => {
    const body = minimal();
    expect(() =>
      parseCalendarSendCalendar(
        new PacketReader(body.subarray(0, body.length - 2)),
      ),
    ).toThrow();
  });

  test("SMSG_CALENDAR_SEND_EVENT stores the description after the title (Calendar/CalendarMgr.cpp:627-671)", () => {
    const parsed = parseCalendarSendEvent(
      new PacketReader(
        calendarSendEventBody({
          creator: 0x0100_0000_0000_0001n,
          description: "details",
          dungeonId: -1,
          eventId: 7n,
          flags: 0,
          guildId: 0,
          sendType: 0,
          time: JULY,
          title: "Draft",
          type: 0,
          zoneTime: ZONE,
        }),
      ),
    );
    expect(parsed.title).toBe("Draft");
    expect(parsed.description).toBe("details");
    expect(parsed.invites).toEqual([]);
    expect(parsed.guildId).toBe(0);
  });

  test("SMSG_CALENDAR_SEND_NUM_PENDING reads the count (Handlers/CalendarHandler.cpp:788-790)", () => {
    expect(
      parseCalendarSendNumPending(new PacketReader(calendarNumPendingBody(3)))
        .pending,
    ).toBe(3);
  });

  test.each([4, 10, 13])(
    "SMSG_CALENDAR_COMMAND_RESULT keeps the name for error %i (Calendar/CalendarMgr.cpp:696-719)",
    (error) => {
      expect(
        parseCalendarCommandResult(
          new PacketReader(calendarCommandResultBody({ error, name: "Nox" })),
        ),
      ).toEqual({ error, name: "Nox" });
    },
  );

  test("a command-result reply for any other error has an empty name", () => {
    expect(
      parseCalendarCommandResult(
        new PacketReader(calendarCommandResultBody({ error: 6 })),
      ),
    ).toEqual({ error: 6, name: "" });
  });
});

describe("calendar client builders", () => {
  const spec = {
    description: "details",
    dungeonId: -1,
    flags: 0,
    maxInvites: 100,
    repeat: 0,
    time: JULY,
    title: "Raid",
    type: 0,
    zoneTime: ZONE,
  };

  test("CMSG_CALENDAR_ADD_EVENT writes the spec then the packed invites (Handlers/CalendarHandler.cpp:249-252,331-337)", () => {
    const body = buildAddEvent(spec, [
      { guid: 0x0100_0000_0000_0001n, rank: 2, status: 3 },
    ]);
    const reader = new PacketReader(body);
    expect(reader.cString()).toBe("Raid");
    expect(reader.cString()).toBe("details");
    expect(reader.uint8()).toBe(0);
    expect(reader.uint8()).toBe(0);
    expect(reader.uint32LE()).toBe(100);
    expect(reader.int32LE()).toBe(-1);
    expect(reader.uint32LE()).toBe(packCalendarTime(JULY));
    expect(reader.uint32LE()).toBe(packCalendarTime(ZONE));
    expect(reader.uint32LE()).toBe(0);
    expect(reader.uint32LE()).toBe(1);
    expect(reader.packedGuidBig()).toBe(0x0100_0000_0000_0001n);
    expect(reader.uint8()).toBe(3);
    expect(reader.uint8()).toBe(2);
  });

  test("CMSG_CALENDAR_ADD_EVENT for a guild announcement omits the invite list (Handlers/CalendarHandler.cpp:319-340)", () => {
    const body = buildAddEvent(
      { ...spec, flags: CalendarFlag.WithoutInvites },
      [{ guid: 1n, rank: 0, status: 0 }],
    );
    expect(new PacketReader(body).cString()).toBe("Raid");
    expect(body[body.length - 4]).toBe(CalendarFlag.WithoutInvites);
  });

  test("CMSG_CALENDAR_UPDATE_EVENT writes the ids then the spec (Handlers/CalendarHandler.cpp:381-384)", () => {
    const reader = new PacketReader(buildUpdateEvent(7n, 9n, spec));
    expect(reader.uint64LE()).toBe(7n);
    expect(reader.uint64LE()).toBe(9n);
    expect(reader.cString()).toBe("Raid");
  });

  test("CMSG_CALENDAR_REMOVE_EVENT sends the event id first (Handlers/CalendarHandler.cpp:421-430)", () => {
    const reader = new PacketReader(buildRemoveEvent(7n, 9n, 0));
    expect(reader.uint64LE()).toBe(7n);
    expect(reader.uint64LE()).toBe(9n);
    expect(reader.uint32LE()).toBe(0);
  });

  test("CMSG_CALENDAR_COPY_EVENT sends the ids and the packed time (Handlers/CalendarHandler.cpp:435-440)", () => {
    const reader = new PacketReader(buildCopyEvent(7n, 9n, JULY));
    expect(reader.uint64LE()).toBe(7n);
    expect(reader.uint64LE()).toBe(9n);
    expect(reader.uint32LE()).toBe(packCalendarTime(JULY));
  });

  test("CMSG_CALENDAR_EVENT_INVITE sends the name and the pre-invite flags (Handlers/CalendarHandler.cpp:517-533)", () => {
    const reader = new PacketReader(
      buildEventInvite(7n, 0n, "Thrall", true, false),
    );
    expect(reader.uint64LE()).toBe(7n);
    expect(reader.uint64LE()).toBe(0n);
    expect(reader.cString()).toBe("Thrall");
    expect(reader.uint8()).toBe(1);
    expect(reader.uint8()).toBe(0);
  });

  test("CMSG_CALENDAR_EVENT_RSVP sends the two ids and the u32 status (Handlers/CalendarHandler.cpp:637-644)", () => {
    const reader = new PacketReader(buildEventRsvp(7n, 9n, 1));
    expect(reader.uint64LE()).toBe(7n);
    expect(reader.uint64LE()).toBe(9n);
    expect(reader.uint32LE()).toBe(1);
  });

  test("CMSG_CALENDAR_EVENT_SIGNUP sends the event id and the tentative byte (Handlers/CalendarHandler.cpp:611-618)", () => {
    const reader = new PacketReader(buildEventSignup(7n, true));
    expect(reader.uint64LE()).toBe(7n);
    expect(reader.uint8()).toBe(1);
  });

  test("CMSG_CALENDAR_EVENT_REMOVE_INVITE uses the packed guid first (Handlers/CalendarHandler.cpp:681-682)", () => {
    const guid = 0x0100_0000_0000_0001n;
    const reader = new PacketReader(buildRemoveInvite(guid, 9n, 11n, 7n));
    expect(reader.packedGuidBig()).toBe(guid);
    expect(reader.uint64LE()).toBe(9n);
    expect(reader.uint64LE()).toBe(11n);
    expect(reader.uint64LE()).toBe(7n);
  });

  test("CMSG_CALENDAR_EVENT_STATUS sends the packed guid, three ids and a u8 status (Handlers/CalendarHandler.cpp:710-711)", () => {
    const guid = 0x0100_0000_0000_0001n;
    const status = new PacketReader(buildEventStatus(guid, 7n, 9n, 11n, 1));
    expect(status.packedGuidBig()).toBe(guid);
    expect(status.uint64LE()).toBe(7n);
    expect(status.uint64LE()).toBe(9n);
    expect(status.uint64LE()).toBe(11n);
    expect(status.uint8()).toBe(1);
  });

  test("CMSG_CALENDAR_EVENT_MODERATOR_STATUS sends the packed guid, three ids and a u8 rank (Handlers/CalendarHandler.cpp:742-743)", () => {
    const guid = 0x0100_0000_0000_0001n;
    const rank = new PacketReader(buildModeratorStatus(guid, 7n, 9n, 11n, 1));
    expect(rank.packedGuidBig()).toBe(guid);
    expect(rank.uint64LE()).toBe(7n);
    expect(rank.uint64LE()).toBe(9n);
    expect(rank.uint64LE()).toBe(11n);
    expect(rank.uint8()).toBe(1);
  });

  test("CMSG_CALENDAR_GUILD_FILTER sends three u32 levels and rank (Server/Packets/CalendarPackets.cpp:26-31)", () => {
    const reader = new PacketReader(buildGuildFilter(1, 80, 3));
    expect(reader.uint32LE()).toBe(1);
    expect(reader.uint32LE()).toBe(80);
    expect(reader.uint32LE()).toBe(3);
  });

  test("CMSG_CALENDAR_ARENA_TEAM sends the team id (Server/Packets/CalendarPackets.cpp:33-36)", () => {
    expect(
      new PacketReader(buildArenaTeam(12)).uint32LE(),
    ).toBe(12);
  });

  test("CMSG_CALENDAR_COMPLAIN sends the event id and the packed guid (Server/Packets/CalendarPackets.cpp:38-42)", () => {
    const reader = new PacketReader(
      buildComplain(7n, 0x0100_0000_0000_0001n),
    );
    expect(reader.uint64LE()).toBe(7n);
    expect(reader.packedGuidBig()).toBe(0x0100_0000_0000_0001n);
  });
});

describe("calendar server alerts", () => {
  const creator = 0x0100_0000_0000_0001n;
  const sender = 0x0100_0000_0000_0002n;

  test("SMSG_CALENDAR_FILTER_GUILD lists packed guids (Guilds/Guild.cpp:2201-2229)", () => {
    const parsed = parseCalendarFilterGuild(
      new PacketReader(calendarFilterGuildBody({ members: [{ guid: creator }] })),
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
          calendarInviteRemovedBody({ eventId: 7n, flags: 1, invitee: creator }),
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
          calendarModeratorAlertBody({ eventId: 7n, invitee: creator, rank: 1 }),
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
