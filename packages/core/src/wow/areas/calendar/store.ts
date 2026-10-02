import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  CalendarBind,
  CalendarHoliday,
  CalendarInvite,
  CalendarListEvent,
  CalendarSendCalendar,
  CalendarSendEvent,
} from "#wow/areas/calendar/protocol-read";
import type { PackedTime } from "#wow/protocol/packed-time";

export type CalendarDetail = CalendarSendEvent;

export type CalendarState = {
  readonly invites: readonly CalendarInvite[];
  readonly events: readonly CalendarListEvent[];
  readonly serverTime: number | undefined;
  readonly zoneTime: PackedTime | undefined;
  readonly serverOffsetSeconds: number | undefined;
  readonly binds: readonly CalendarBind[];
  readonly relationTime: number | undefined;
  readonly resets: readonly { mapId: number; period: number; offset: number }[];
  readonly holidays: readonly CalendarHoliday[];
  readonly details: Readonly<Record<string, CalendarDetail>>;
  readonly pending: number | undefined;
  readonly receivedAt: number | undefined;
};

export type CalendarEvent =
  | { type: "calendar"; state: CalendarState }
  | { type: "event"; sendType: number; state: CalendarState }
  | { type: "pending"; pending: number; state: CalendarState }
  | {
      type: "command_result";
      error: number;
      name: string;
      state: CalendarState;
    };

const EMPTY: CalendarState = {
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
};

function detachInvite(invite: CalendarInvite): CalendarInvite {
  return { ...invite };
}

function detachListEvent(event: CalendarListEvent): CalendarListEvent {
  return { ...event, time: { ...event.time } };
}

function detachBind(bind: CalendarBind): CalendarBind {
  return { ...bind };
}

function detachHoliday(holiday: CalendarHoliday): CalendarHoliday {
  return {
    ...holiday,
    dates: [...holiday.dates],
    durations: [...holiday.durations],
    flags: [...holiday.flags],
  };
}

function detachDetail(detail: CalendarDetail): CalendarDetail {
  return {
    ...detail,
    invites: detail.invites.map((invite) => ({
      ...invite,
      statusTime: { ...invite.statusTime },
    })),
    time: { ...detail.time },
    zoneTime: { ...detail.zoneTime },
  };
}

function detachDetails(
  details: Readonly<Record<string, CalendarDetail>>,
): Record<string, CalendarDetail> {
  return Object.fromEntries(
    Object.entries(details).map(([id, detail]) => [id, detachDetail(detail)]),
  );
}

function detach(state: CalendarState): CalendarState {
  return {
    ...state,
    binds: state.binds.map(detachBind),
    details: detachDetails(state.details),
    events: state.events.map(detachListEvent),
    holidays: state.holidays.map(detachHoliday),
    invites: state.invites.map(detachInvite),
    resets: state.resets.map((reset) => ({ ...reset })),
    zoneTime: state.zoneTime && { ...state.zoneTime },
  };
}

export class CalendarStore {
  private readonly events = new Emitter<[CalendarEvent]>();
  private state: CalendarState = EMPTY;

  private readonly now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }

  snapshot(): CalendarState {
    return detach(this.state);
  }

  onEvent(cb: (event: CalendarEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  receiveCalendar(parsed: CalendarSendCalendar): void {
    this.state = {
      ...this.state,
      binds: parsed.binds.map(detachBind),
      events: parsed.events.map(detachListEvent),
      holidays: parsed.holidays.map(detachHoliday),
      invites: parsed.invites.map(detachInvite),
      receivedAt: this.now(),
      relationTime: parsed.relationTime,
      resets: parsed.resets.map((reset) => ({ ...reset })),
      serverOffsetSeconds:
        Math.floor(
          Date.UTC(
            parsed.zoneTime.year,
            parsed.zoneTime.month - 1,
            parsed.zoneTime.day,
            parsed.zoneTime.hour,
            parsed.zoneTime.minute,
          ) / 1000,
        ) - parsed.serverTime,
      serverTime: parsed.serverTime,
      zoneTime: { ...parsed.zoneTime },
    };
    this.events.emit({ state: this.snapshot(), type: "calendar" });
  }

  receiveEvent(parsed: CalendarSendEvent): void {
    const id = parsed.eventId.toString();
    this.state = {
      ...this.state,
      details: { ...detachDetails(this.state.details), [id]: parsed },
      receivedAt: this.now(),
    };
    this.events.emit({
      sendType: parsed.sendType,
      state: this.snapshot(),
      type: "event",
    });
  }

  receiveNumPending(pending: number): void {
    this.state = { ...this.state, pending, receivedAt: this.now() };
    this.events.emit({
      pending,
      state: this.snapshot(),
      type: "pending",
    });
  }

  receiveCommandResult(error: number, name: string): void {
    this.state = { ...this.state, receivedAt: this.now() };
    this.events.emit({
      error,
      name,
      state: this.snapshot(),
      type: "command_result",
    });
  }

  dispose(): void {
    this.events.clear();
  }
}
