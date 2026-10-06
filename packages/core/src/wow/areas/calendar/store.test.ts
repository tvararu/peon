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
      arenaTeam: [],
      binds: [],
      clearedPending: 0,
      createdByMe: [],
      details: {},
      events: [],
      filterGuild: [],
      holidays: [],
      invites: [],
      lockoutUpdates: [],
      lockouts: [],
      pending: undefined,
      receivedAt: undefined,
      relationTime: undefined,
      resets: [],
      selfInvites: {},
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

describe("CalendarStore alerts", () => {
  const JULY = {
    year: 2026,
    month: 7,
    day: 4,
    weekday: 6,
    hour: 12,
    minute: 0,
  };
  const SELF = 0x0100_0000_0000_0001n;
  const OTHER = 0x0100_0000_0000_0002n;

  test("an invite alert for an unknown event lists it and emits once", () => {
    const store = new CalendarStore(() => 0);
    const seen: CalendarEvent[] = [];
    store.onEvent((event) => seen.push(event));
    store.receiveEventInviteAlert({
      creator: SELF,
      dungeonId: -1,
      eventId: 7n,
      flags: 0,
      time: JULY,
      title: "Raid",
      type: 0,
    });
    expect(store.snapshot().events.map((event) => event.title)).toEqual([
      "Raid",
    ]);
    expect(seen.map((event) => event.type)).toEqual(["invite_alert"]);
  });

  test("a second alert for the same event does not duplicate it", () => {
    const store = new CalendarStore(() => 0);
    const alert = {
      creator: SELF,
      dungeonId: -1,
      eventId: 7n,
      flags: 0,
      time: JULY,
      title: "Raid",
      type: 0,
    };
    store.receiveEventInviteAlert(alert);
    store.receiveEventInviteAlert(alert);
    expect(store.snapshot().events).toHaveLength(1);
  });

  test("an updated alert rewrites the event row", () => {
    const store = new CalendarStore(() => 0);
    store.receiveEventInviteAlert({
      creator: SELF,
      dungeonId: -1,
      eventId: 7n,
      flags: 0,
      time: JULY,
      title: "Raid",
      type: 0,
    });
    const seen: CalendarEvent[] = [];
    store.onEvent((event) => seen.push(event));
    store.receiveUpdatedAlert({
      description: "details",
      dungeonId: -1,
      eventId: 7n,
      flags: 1,
      time: JULY,
      title: "Meet",
      type: 1,
    });
    expect(store.snapshot().events[0]).toMatchObject({
      flags: 1,
      title: "Meet",
    });
    expect(seen.map((event) => event.type)).toEqual(["updated_alert"]);
  });

  test("a removed alert drops the event and any self invite", () => {
    const store = new CalendarStore(() => 0);
    store.receiveEventInviteAlert({
      creator: SELF,
      dungeonId: -1,
      eventId: 7n,
      flags: 0,
      time: JULY,
      title: "Raid",
      type: 0,
    });
    store.receiveInvite(
      {
        eventId: 7n,
        hasStatusTime: false,
        invited: true,
        invitee: SELF,
        inviteId: 9n,
        level: 80,
        status: 0,
        statusTime: undefined,
      },
      SELF,
    );
    store.receiveRemovedAlert(7n);
    expect(store.snapshot().events).toEqual([]);
    expect(store.snapshot().selfInvites).toEqual({});
  });

  test("a status reply updates the stored invite rank and status", () => {
    const store = new CalendarStore(() => 0);
    store.receiveEvent(
      parseCalendarSendEvent(
        new PacketReader(
          calendarSendEventBody({
            creator: SELF,
            description: "details",
            dungeonId: -1,
            eventId: 7n,
            flags: 0,
            guildId: 0,
            invites: [
              {
                guildEvent: false,
                invitee: OTHER,
                inviteId: 9n,
                level: 80,
                rank: 0,
                status: 0,
                statusTime: JULY,
                text: "",
              },
            ],
            sendType: 0,
            time: JULY,
            title: "Raid",
            type: 0,
            zoneTime: JULY,
          }),
        ),
      ),
    );
    store.receiveStatus({
      eventId: 7n,
      flags: 0,
      invitee: OTHER,
      rank: 1,
      status: 1,
      statusTime: JULY,
      time: JULY,
    });
    expect(store.snapshot().details["7"]?.invites[0]).toMatchObject({
      rank: 1,
      status: 1,
    });
  });

  test("removing an invite drops only that invite and a moderator alert sets rank", () => {
    const store = new CalendarStore(() => 0);
    store.receiveEvent(
      parseCalendarSendEvent(
        new PacketReader(
          calendarSendEventBody({
            creator: SELF,
            description: "details",
            dungeonId: -1,
            eventId: 7n,
            flags: 0,
            guildId: 0,
            invites: [
              {
                guildEvent: false,
                invitee: SELF,
                inviteId: 9n,
                level: 80,
                rank: 0,
                status: 0,
                statusTime: JULY,
                text: "",
              },
              {
                guildEvent: false,
                invitee: OTHER,
                inviteId: 10n,
                level: 80,
                rank: 0,
                status: 0,
                statusTime: JULY,
                text: "",
              },
            ],
            sendType: 0,
            time: JULY,
            title: "Raid",
            type: 0,
            zoneTime: JULY,
          }),
        ),
      ),
    );
    const seen: CalendarEvent[] = [];
    store.onEvent((event) => seen.push(event));
    store.receiveModeratorAlert(7n, OTHER, 1);
    store.receiveInviteRemoved({ eventId: 7n, invitee: OTHER });
    expect(
      store.snapshot().details["7"]?.invites.map((invite) => invite.invitee),
    ).toEqual([SELF]);
    expect(seen.map((event) => event.type)).toEqual([
      "moderator_alert",
      "invite_removed",
    ]);
  });

  test("filter, arena, lockout and clear-pending replies fill their state", () => {
    const store = new CalendarStore(() => 3);
    store.receiveNumPending(2);
    store.receiveFilterGuild([{ guid: OTHER, level: 80 }]);
    store.receiveArenaTeam([{ guid: OTHER, unk: 3 }]);
    store.receiveLockoutAdded({
      difficulty: 1,
      instanceGuid: 99n,
      mapId: 631,
      secondsLeft: 3600,
      time: JULY,
    });
    store.receiveLockoutUpdated({
      difficulty: 1,
      mapId: 631,
      newSeconds: 7200,
      oldSeconds: 3600,
      time: JULY,
    });
    store.receiveLockoutRemoved({
      difficulty: 1,
      instanceGuid: 99n,
      mapId: 631,
      secondsLeft: 0,
      time: undefined,
    });
    store.receiveClearPending();
    expect(store.snapshot().filterGuild).toEqual([{ guid: OTHER, level: 80 }]);
    expect(store.snapshot().arenaTeam).toEqual([{ guid: OTHER, unk: 3 }]);
    expect(store.snapshot().lockouts).toEqual([]);
    expect(store.snapshot().lockoutUpdates).toHaveLength(1);
    expect(store.snapshot().pending).toBe(1);
    expect(store.snapshot().clearedPending).toBe(1);
  });

  test("an invite for another player leaves self invites alone", () => {
    const store = new CalendarStore(() => 0);
    store.receiveInvite(
      {
        eventId: 7n,
        hasStatusTime: false,
        invited: true,
        invitee: OTHER,
        inviteId: 9n,
        level: 80,
        status: 0,
        statusTime: undefined,
      },
      SELF,
    );
    expect(store.snapshot().selfInvites).toEqual({});
  });
});
