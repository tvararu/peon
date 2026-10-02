import { describe, expect, test } from "bun:test";
import {
  type CalendarSendCalendarInit,
  calendarCommandResultBody,
  calendarNumPendingBody,
  calendarSendCalendarBody,
  calendarSendEventBody,
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

  test("a reply with one invite and one event keeps both guids (Handlers/CalendarHandler.cpp:64-96)", () => {
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

  test("binds, reset periods and the relation time survive a full reply (Handlers/CalendarHandler.cpp:101-154)", () => {
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

  test("a holiday with 26 dates, 10 durations, 10 flags and a texture keeps them all (CalendarHandler.cpp:156-190)", () => {
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

  test("a send-event reply stores the description after the title (Calendar/CalendarMgr.cpp:627-671)", () => {
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

  test("a pending-count reply reads the count (Handlers/CalendarHandler.cpp:788-790)", () => {
    expect(
      parseCalendarSendNumPending(new PacketReader(calendarNumPendingBody(3)))
        .pending,
    ).toBe(3);
  });

  test.each([4, 10, 13])(
    "a command-result reply keeps the name for error %i (Calendar/CalendarMgr.cpp:696-719)",
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
