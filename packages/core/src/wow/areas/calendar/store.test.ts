import { describe, expect, test } from "bun:test";
import {
  calendarSendCalendarBody,
  calendarSendEventBody,
} from "#test-support/areas/calendar";
import {
  parseCalendarSendCalendar,
  parseCalendarSendEvent,
} from "#wow/areas/calendar/protocol-read";
import { type CalendarEvent, CalendarStore } from "#wow/areas/calendar/store";
import { PacketReader } from "#wow/protocol/packet";

const ZONE = {
  year: 2026,
  month: 7,
  day: 4,
  weekday: 6,
  hour: 19,
  minute: 0,
};
const START = {
  year: 2026,
  month: 7,
  day: 4,
  weekday: 6,
  hour: 12,
  minute: 0,
};

function fullBody() {
  return calendarSendCalendarBody({
    binds: [
      { difficulty: 1, instanceGuid: 99n, mapId: 631, secondsLeft: 3600 },
    ],
    events: [
      {
        creator: 0x0100_0000_0000_0001n,
        dungeonId: -1,
        flags: 0,
        id: 7n,
        time: START,
        title: "Raid",
        type: 0,
      },
    ],
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
    relationTime: 12_345,
    resets: [{ mapId: 631, offset: 0, period: 604_800 }],
    serverTime: 1_790_928_000,
    zoneTime: ZONE,
  });
}

function eventBody() {
  return calendarSendEventBody({
    creator: 0x0100_0000_0000_0001n,
    description: "details",
    dungeonId: -1,
    eventId: 7n,
    flags: 0,
    guildId: 0,
    sendType: 0,
    time: START,
    title: "Draft",
    type: 0,
    zoneTime: ZONE,
  });
}

describe("CalendarStore", () => {
  test("starts with no calendar", () => {
    expect(new CalendarStore(() => 0).snapshot()).toEqual({
      binds: [],
      details: {},
      events: [],
      holidays: [],
      invites: [],
      pending: undefined,
      receivedAt: undefined,
      relationTime: undefined,
      resets: [],
      serverOffsetSeconds: undefined,
      serverTime: undefined,
      zoneTime: undefined,
    });
  });

  test("a send-calendar reply fills every list and recomputes the offset", () => {
    const store = new CalendarStore(() => 1000);
    const seen: CalendarEvent[] = [];
    store.onEvent((event) => seen.push(event));
    store.receiveCalendar(
      parseCalendarSendCalendar(new PacketReader(fullBody())),
    );
    const snapshot = store.snapshot();
    expect(
      snapshot.invites.map((i: { inviteId: bigint }) => i.inviteId),
    ).toEqual([9n]);
    expect(snapshot.events.map((e: { title: string }) => e.title)).toEqual([
      "Raid",
    ]);
    expect(snapshot.binds.map((b: { mapId: number }) => b.mapId)).toEqual([
      631,
    ]);
    expect(snapshot.resets).toEqual([
      { mapId: 631, offset: 0, period: 604_800 },
    ]);
    expect(snapshot.holidays.map((h: { id: number }) => h.id)).toEqual([62]);
    expect(snapshot.serverTime).toBe(1_790_928_000);
    expect(snapshot.zoneTime).toEqual(ZONE);
    expect(snapshot.serverOffsetSeconds).toBe(
      Math.floor(Date.UTC(2026, 6, 4, 19, 0) / 1000) - 1_790_928_000,
    );
    expect(snapshot.receivedAt).toBe(1000);
    expect(seen.map((e: { type: string }) => e.type)).toEqual(["calendar"]);
  });

  test("a second reply replaces the lists and detaches the event state", () => {
    const store = new CalendarStore(() => 0);
    const seen: CalendarEvent[] = [];
    store.onEvent((event) => seen.push(event));
    store.receiveCalendar(
      parseCalendarSendCalendar(new PacketReader(fullBody())),
    );
    store.receiveCalendar(
      parseCalendarSendCalendar(
        new PacketReader(
          calendarSendCalendarBody({ serverTime: 5, zoneTime: ZONE }),
        ),
      ),
    );
    expect(store.snapshot().invites).toEqual([]);
    expect(store.snapshot().events).toEqual([]);
    expect(store.snapshot().serverTime).toBe(5);
    expect(seen).toHaveLength(2);
    const last = seen[1];
    if (last?.type !== "calendar") throw new Error("no calendar event");
    Array.prototype.push.call(last.state.invites, 1);
    expect(store.snapshot().invites).toEqual([]);
  });

  test("a send-event reply stores details by event id and emits the send type", () => {
    const store = new CalendarStore(() => 7);
    const seen: CalendarEvent[] = [];
    store.onEvent((event) => seen.push(event));
    store.receiveEvent(parseCalendarSendEvent(new PacketReader(eventBody())));
    store.receiveEvent(parseCalendarSendEvent(new PacketReader(eventBody())));
    expect(store.snapshot().details["7"]?.title).toBe("Draft");
    expect(store.snapshot().receivedAt).toBe(7);
    expect(seen.map((e: { type: string }) => e.type)).toEqual([
      "event",
      "event",
    ]);
    expect(seen[0]).toMatchObject({ sendType: 0, type: "event" });
  });

  test("pending and command-result replies set pending and emit with a detached state", () => {
    const store = new CalendarStore(() => 3);
    const seen: CalendarEvent[] = [];
    store.onEvent((event) => seen.push(event));
    store.receiveNumPending(3);
    store.receiveCommandResult(6, "");
    expect(store.snapshot().pending).toBe(3);
    expect(seen.map((e: { type: string }) => e.type)).toEqual([
      "pending",
      "command_result",
    ]);
    expect(seen[1]).toMatchObject({
      error: 6,
      name: "",
      type: "command_result",
    });
    const last = seen[1];
    if (last?.type !== "command_result") throw new Error("no result event");
    Array.prototype.push.call(last.state.events, 1);
    expect(store.snapshot().events).toEqual([]);
  });

  test("dispose clears the listeners", () => {
    const store = new CalendarStore(() => 0);
    let calls = 0;
    store.onEvent(() => {
      calls += 1;
    });
    store.dispose();
    store.receiveNumPending(1);
    expect(calls).toBe(0);
    expect(store.snapshot().pending).toBe(1);
  });
});
