import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  CalendarBind,
  CalendarHoliday,
  CalendarInvite,
  CalendarListEvent,
  CalendarSendCalendar,
  CalendarSendEvent,
} from "#wow/areas/calendar/protocol-read";
import type {
  CalendarArenaTeam,
  CalendarEventInvitePacket,
  CalendarEventStatusPacket,
  CalendarFilterGuild,
  CalendarLockout,
  CalendarLockoutUpdated,
} from "#wow/areas/calendar/protocol-server";
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
  readonly filterGuild: CalendarFilterGuild["members"];
  readonly arenaTeam: CalendarArenaTeam["members"];
  readonly lockouts: readonly CalendarLockout[];
  readonly lockoutUpdates: readonly CalendarLockoutUpdated[];
  readonly selfInvites: Readonly<Record<string, CalendarEventInvitePacket>>;
  readonly createdByMe: readonly bigint[];
  readonly clearedPending: number;
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
    }
  | { type: "invite"; eventId: bigint; state: CalendarState }
  | { type: "invite_removed"; eventId: bigint; state: CalendarState }
  | { type: "invite_alert"; eventId: bigint; state: CalendarState }
  | { type: "status"; eventId: bigint; state: CalendarState }
  | { type: "removed_alert"; eventId: bigint; state: CalendarState }
  | { type: "updated_alert"; eventId: bigint; state: CalendarState }
  | { type: "moderator_alert"; eventId: bigint; state: CalendarState }
  | { type: "filter_guild"; state: CalendarState }
  | { type: "arena_team"; state: CalendarState }
  | { type: "lockout_added"; mapId: number; state: CalendarState }
  | { type: "lockout_removed"; mapId: number; state: CalendarState }
  | { type: "lockout_updated"; mapId: number; state: CalendarState }
  | { type: "clear_pending"; state: CalendarState };

const EMPTY: CalendarState = {
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
    arenaTeam: state.arenaTeam.map((member) => ({ ...member })),
    binds: state.binds.map(detachBind),
    createdByMe: [...state.createdByMe],
    details: detachDetails(state.details),
    events: state.events.map(detachListEvent),
    filterGuild: state.filterGuild.map((member) => ({ ...member })),
    holidays: state.holidays.map(detachHoliday),
    invites: state.invites.map(detachInvite),
    lockoutUpdates: state.lockoutUpdates.map((update) => ({
      ...update,
      time: { ...update.time },
    })),
    lockouts: state.lockouts.map((lockout) => ({
      ...lockout,
      time: lockout.time && { ...lockout.time },
    })),
    resets: state.resets.map((reset) => ({ ...reset })),
    selfInvites: Object.fromEntries(
      Object.entries(state.selfInvites).map(([id, invite]) => [
        id,
        {
          ...invite,
          statusTime: invite.statusTime && { ...invite.statusTime },
        },
      ]),
    ),
    zoneTime: state.zoneTime && { ...state.zoneTime },
  };
}

export class CalendarStore {
  private readonly events = new Emitter<[CalendarEvent]>();
  private state: CalendarState = EMPTY;

  private readonly now: () => number;
  private readonly self: () => bigint;

  constructor(now: () => number, selfGuid?: () => bigint) {
    this.now = now;
    this.self = selfGuid ?? (() => 0n);
  }

  selfGuid(): bigint {
    return this.self();
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

  receiveInvite(
    parsed: CalendarEventInvitePacket,
    selfGuid: bigint,
  ): void {
    const key = parsed.eventId.toString();
    const selfInvites = { ...this.state.selfInvites };
    if (parsed.invitee === selfGuid)
      selfInvites[key] = {
        ...parsed,
        statusTime: parsed.statusTime && { ...parsed.statusTime },
      };
    this.state = { ...this.state, receivedAt: this.now(), selfInvites };
    this.events.emit({
      eventId: parsed.eventId,
      state: this.snapshot(),
      type: "invite",
    });
  }

  receiveEventInviteAlert(parsed: {
    eventId: bigint;
    title: string;
    time: PackedTime;
    flags: number;
    type: number;
    dungeonId: number;
    creator: bigint;
  }): void {
    const key = parsed.eventId.toString();
    if (this.state.details[key] === undefined) {
      const current = this.state.events.some((event) => event.id === parsed.eventId)
        ? this.state.events.map(detachListEvent)
        : [
            ...this.state.events.map(detachListEvent),
            {
              creator: parsed.creator,
              dungeonId: parsed.dungeonId,
              flags: parsed.flags,
              id: parsed.eventId,
              time: { ...parsed.time },
              title: parsed.title,
              type: parsed.type,
            },
          ];
      this.state = { ...this.state, events: current };
    }
    this.state = { ...this.state, receivedAt: this.now() };
    this.events.emit({
      eventId: parsed.eventId,
      state: this.snapshot(),
      type: "invite_alert",
    });
  }

  receiveStatus(parsed: CalendarEventStatusPacket): void {
    const key = parsed.eventId.toString();
    const detail = this.state.details[key];
    if (detail) {
      const invites = detail.invites.map((invite) =>
        invite.invitee === parsed.invitee
          ? { ...invite, rank: parsed.rank, status: parsed.status, statusTime: { ...parsed.statusTime } }
          : { ...invite },
      );
      this.state = {
        ...this.state,
        details: {
          ...detachDetails(this.state.details),
          [key]: { ...detachDetail(detail), invites, time: { ...parsed.time } },
        },
      };
    }
    this.state = { ...this.state, receivedAt: this.now() };
    this.events.emit({
      eventId: parsed.eventId,
      state: this.snapshot(),
      type: "status",
    });
  }

  receiveInviteRemoved(parsed: { invitee: bigint; eventId: bigint }): void {
    const key = parsed.eventId.toString();
    const detail = this.state.details[key];
    if (detail)
      this.state = {
        ...this.state,
        details: {
          ...detachDetails(this.state.details),
          [key]: {
            ...detachDetail(detail),
            invites: detail.invites.filter((invite) => invite.invitee !== parsed.invitee),
          },
        },
      };
    const selfInvites = { ...this.state.selfInvites };
    delete selfInvites[key];
    this.state = { ...this.state, receivedAt: this.now(), selfInvites };
    this.events.emit({
      eventId: parsed.eventId,
      state: this.snapshot(),
      type: "invite_removed",
    });
  }

  receiveUpdatedAlert(parsed: {
    eventId: bigint;
    flags: number;
    time: PackedTime;
    type: number;
    dungeonId: number;
    title: string;
    description: string;
  }): void {
    const events = this.state.events.map((event) =>
      event.id === parsed.eventId
        ? {
            ...event,
            dungeonId: parsed.dungeonId,
            flags: parsed.flags,
            time: { ...parsed.time },
            title: parsed.title,
            type: parsed.type,
          }
        : { ...event },
    );
    const key = parsed.eventId.toString();
    const detail = this.state.details[key];
    const details =
      detail === undefined
        ? detachDetails(this.state.details)
        : {
            ...detachDetails(this.state.details),
            [key]: {
              ...detachDetail(detail),
              description: parsed.description,
              dungeonId: parsed.dungeonId,
              flags: parsed.flags,
              time: { ...parsed.time },
              title: parsed.title,
              type: parsed.type,
            },
          };
    this.state = { ...this.state, details, events, receivedAt: this.now() };
    this.events.emit({
      eventId: parsed.eventId,
      state: this.snapshot(),
      type: "updated_alert",
    });
  }

  receiveRemovedAlert(eventId: bigint): void {
    const key = eventId.toString();
    const details = detachDetails(this.state.details);
    delete details[key];
    const selfInvites = { ...this.state.selfInvites };
    delete selfInvites[key];
    this.state = {
      ...this.state,
      details,
      events: this.state.events.filter((event) => event.id !== eventId),
      receivedAt: this.now(),
      selfInvites,
    };
    this.events.emit({
      eventId,
      state: this.snapshot(),
      type: "removed_alert",
    });
  }

  receiveModeratorAlert(eventId: bigint, invitee: bigint, rank: number): void {
    const key = eventId.toString();
    const detail = this.state.details[key];
    if (detail)
      this.state = {
        ...this.state,
        details: {
          ...detachDetails(this.state.details),
          [key]: {
            ...detachDetail(detail),
            invites: detail.invites.map((invite) =>
              invite.invitee === invitee ? { ...invite, rank } : { ...invite },
            ),
          },
        },
        receivedAt: this.now(),
      };
    else this.state = { ...this.state, receivedAt: this.now() };
    this.events.emit({
      eventId,
      state: this.snapshot(),
      type: "moderator_alert",
    });
  }

  receiveFilterGuild(members: CalendarFilterGuild["members"]): void {
    this.state = {
      ...this.state,
      filterGuild: members.map((member) => ({ ...member })),
      receivedAt: this.now(),
    };
    this.events.emit({ state: this.snapshot(), type: "filter_guild" });
  }

  receiveArenaTeam(members: CalendarArenaTeam["members"]): void {
    this.state = {
      ...this.state,
      arenaTeam: members.map((member) => ({ ...member })),
      receivedAt: this.now(),
    };
    this.events.emit({ state: this.snapshot(), type: "arena_team" });
  }

  receiveLockoutAdded(lockout: CalendarLockout): void {
    const kept = this.state.lockouts.filter(
      (seen) =>
        seen.mapId !== lockout.mapId || seen.difficulty !== lockout.difficulty,
    );
    this.state = {
      ...this.state,
      lockouts: [
        ...kept.map((seen) => ({
          ...seen,
          time: seen.time && { ...seen.time },
        })),
        { ...lockout, time: lockout.time && { ...lockout.time } },
      ],
      receivedAt: this.now(),
    };
    this.events.emit({
      mapId: lockout.mapId,
      state: this.snapshot(),
      type: "lockout_added",
    });
  }

  receiveLockoutRemoved(lockout: CalendarLockout): void {
    const left = this.state.lockouts.filter(
      (seen) =>
        seen.mapId !== lockout.mapId || seen.difficulty !== lockout.difficulty,
    );
    this.state = {
      ...this.state,
      lockouts: left.map((seen) => ({
        ...seen,
        time: seen.time && { ...seen.time },
      })),
      receivedAt: this.now(),
    };
    this.events.emit({
      mapId: lockout.mapId,
      state: this.snapshot(),
      type: "lockout_removed",
    });
  }

  receiveLockoutUpdated(update: CalendarLockoutUpdated): void {
    this.state = {
      ...this.state,
      lockoutUpdates: [
        ...this.state.lockoutUpdates.map((seen) => ({
          ...seen,
          time: { ...seen.time },
        })),
        { ...update, time: { ...update.time } },
      ],
      receivedAt: this.now(),
    };
    this.events.emit({
      mapId: update.mapId,
      state: this.snapshot(),
      type: "lockout_updated",
    });
  }

  receiveClearPending(): void {
    const pending = this.state.pending;
    this.state = {
      ...this.state,
      clearedPending: this.state.clearedPending + 1,
      pending: pending === undefined ? pending : Math.max(0, pending - 1),
      receivedAt: this.now(),
    };
    this.events.emit({ state: this.snapshot(), type: "clear_pending" });
  }

  markCreated(eventId: bigint): void {
    if (!this.state.createdByMe.includes(eventId))
      this.state = {
        ...this.state,
        createdByMe: [...this.state.createdByMe, eventId],
      };
  }

  dispose(): void {
    this.events.clear();
  }
}
