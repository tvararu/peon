import type {
  CalendarBind,
  CalendarHoliday,
  CalendarInvite,
  CalendarListEvent,
} from "#wow/areas/calendar/protocol-read";
import type { CalendarDetail, CalendarState } from "#wow/areas/calendar/store";

export const EMPTY: CalendarState = {
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

export function detachInvite(invite: CalendarInvite): CalendarInvite {
  return { ...invite };
}

export function detachListEvent(event: CalendarListEvent): CalendarListEvent {
  return { ...event, time: { ...event.time } };
}

export function detachBind(bind: CalendarBind): CalendarBind {
  return { ...bind };
}

export function detachHoliday(holiday: CalendarHoliday): CalendarHoliday {
  return {
    ...holiday,
    dates: [...holiday.dates],
    durations: [...holiday.durations],
    flags: [...holiday.flags],
  };
}

export function detachDetail(detail: CalendarDetail): CalendarDetail {
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

export function detachDetails(
  details: Readonly<Record<string, CalendarDetail>>,
): Record<string, CalendarDetail> {
  return Object.fromEntries(
    Object.entries(details).map(([id, detail]) => [id, detachDetail(detail)]),
  );
}

export function detach(state: CalendarState): CalendarState {
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
