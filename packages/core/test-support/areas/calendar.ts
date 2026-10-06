import type { PackedTime } from "#wow/protocol/packed-time";
import { PacketWriter } from "#wow/protocol/packet";

export function packCalendarTime(time: PackedTime): number {
  return (
    (((time.year - 2000) << 24) |
      ((time.month - 1) << 20) |
      ((time.day - 1) << 14) |
      (time.weekday << 11) |
      (time.hour << 6) |
      time.minute) >>>
    0
  );
}

export type CalendarInviteInit = {
  eventId: bigint;
  inviteId: bigint;
  status: number;
  rank: number;
  guildEvent: boolean;
  creator: bigint;
};

export type CalendarEventInit = {
  id: bigint;
  title: string;
  type: number;
  time: PackedTime;
  flags: number;
  dungeonId: number;
  creator: bigint;
};

export type CalendarBindInit = {
  mapId: number;
  difficulty: number;
  secondsLeft: number;
  instanceGuid: bigint;
};

export type CalendarResetInit = {
  mapId: number;
  period: number;
  offset: number;
};

export type CalendarHolidayInit = {
  id: number;
  region: number;
  looping: number;
  priority: number;
  filterType: number;
  dates: readonly number[];
  durations: readonly number[];
  flags: readonly number[];
  texture: string;
};

export type CalendarSendCalendarInit = {
  invites?: readonly CalendarInviteInit[];
  events?: readonly CalendarEventInit[];
  serverTime: number;
  zoneTime: PackedTime;
  binds?: readonly CalendarBindInit[];
  relationTime?: number;
  resets?: readonly CalendarResetInit[];
  holidays?: readonly CalendarHolidayInit[];
};

function writeFixed(w: PacketWriter, values: readonly number[], count: number) {
  for (let i = 0; i < count; i++) w.uint32LE(values[i] ?? 0);
}

export function calendarSendCalendarBody(
  init: CalendarSendCalendarInit,
): Uint8Array {
  const w = new PacketWriter();
  const invites = init.invites ?? [];
  w.uint32LE(invites.length);
  for (const invite of invites) {
    w.uint64LE(invite.eventId);
    w.uint64LE(invite.inviteId);
    w.uint8(invite.status);
    w.uint8(invite.rank);
    w.uint8(invite.guildEvent ? 1 : 0);
    w.packedGuidBig(invite.creator);
  }
  const events = init.events ?? [];
  w.uint32LE(events.length);
  for (const event of events) {
    w.uint64LE(event.id);
    w.cString(event.title);
    w.uint32LE(event.type);
    w.uint32LE(packCalendarTime(event.time));
    w.uint32LE(event.flags);
    w.uint32LE(event.dungeonId >>> 0);
    w.packedGuidBig(event.creator);
  }
  w.uint32LE(init.serverTime);
  w.uint32LE(packCalendarTime(init.zoneTime));
  const binds = init.binds ?? [];
  w.uint32LE(binds.length);
  for (const bind of binds) {
    w.uint32LE(bind.mapId);
    w.uint32LE(bind.difficulty);
    w.uint32LE(bind.secondsLeft);
    w.uint64LE(bind.instanceGuid);
  }
  w.uint32LE(init.relationTime ?? 0);
  const resets = init.resets ?? [];
  w.uint32LE(resets.length);
  for (const reset of resets) {
    w.uint32LE(reset.mapId >>> 0);
    w.uint32LE(reset.period >>> 0);
    w.uint32LE(reset.offset >>> 0);
  }
  const holidays = init.holidays ?? [];
  w.uint32LE(holidays.length);
  for (const holiday of holidays) {
    w.uint32LE(holiday.id);
    w.uint32LE(holiday.region);
    w.uint32LE(holiday.looping);
    w.uint32LE(holiday.priority);
    w.uint32LE(holiday.filterType);
    writeFixed(w, holiday.dates, 26);
    writeFixed(w, holiday.durations, 10);
    writeFixed(w, holiday.flags, 10);
    w.cString(holiday.texture);
  }
  return w.finish();
}

export type CalendarSendEventInviteInit = {
  invitee: bigint;
  level: number;
  status: number;
  rank: number;
  guildEvent: boolean;
  inviteId: bigint;
  statusTime: PackedTime;
  text: string;
};

export type CalendarSendEventInit = {
  sendType: number;
  creator: bigint;
  eventId: bigint;
  title: string;
  description: string;
  type: number;
  repeat?: number;
  maxInvites?: number;
  dungeonId: number;
  flags: number;
  time: PackedTime;
  zoneTime: PackedTime;
  guildId: number;
  invites?: readonly CalendarSendEventInviteInit[];
};

export function calendarSendEventBody(init: CalendarSendEventInit): Uint8Array {
  const w = new PacketWriter();
  w.uint8(init.sendType);
  w.packedGuidBig(init.creator);
  w.uint64LE(init.eventId);
  w.cString(init.title);
  w.cString(init.description);
  w.uint8(init.type);
  w.uint8(init.repeat ?? 0);
  w.uint32LE(init.maxInvites ?? 100);
  w.uint32LE(init.dungeonId >>> 0);
  w.uint32LE(init.flags);
  w.uint32LE(packCalendarTime(init.time));
  w.uint32LE(packCalendarTime(init.zoneTime));
  w.uint32LE(init.guildId);
  const invites = init.invites ?? [];
  w.uint32LE(invites.length);
  for (const invite of invites) {
    w.packedGuidBig(invite.invitee);
    w.uint8(invite.level);
    w.uint8(invite.status);
    w.uint8(invite.rank);
    w.uint8(invite.guildEvent ? 1 : 0);
    w.uint64LE(invite.inviteId);
    w.uint32LE(packCalendarTime(invite.statusTime));
    w.cString(invite.text);
  }
  return w.finish();
}

export function calendarNumPendingBody(pending: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(pending);
  return w.finish();
}

export function calendarCommandResultBody(init: {
  error: number;
  name?: string;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(0);
  w.uint8(0);
  w.cString(init.name ?? "");
  w.uint32LE(init.error);
  return w.finish();
}

export type CalendarTimeBody = {
  time: PackedTime;
};

export function calendarTimeBody(time: PackedTime): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(packCalendarTime(time));
  return w.finish();
}

export type CalendarFilterGuildBodyInit = {
  members: readonly { guid: bigint }[];
};

export function calendarFilterGuildBody(
  init: CalendarFilterGuildBodyInit,
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.members.length);
  for (const member of init.members) {
    w.packedGuidBig(member.guid);
    w.uint8(0);
  }
  return w.finish();
}

export type CalendarArenaTeamBodyInit = {
  members: readonly { guid: bigint }[];
};

export function calendarArenaTeamBody(
  init: CalendarArenaTeamBodyInit,
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.members.length);
  for (const member of init.members) {
    w.packedGuidBig(member.guid);
    w.uint8(0);
  }
  return w.finish();
}

export type CalendarEventInvitePacketInit = {
  invitee: bigint;
  eventId: bigint;
  inviteId: bigint;
  level: number;
  status: number;
  statusTime?: PackedTime;
  invited?: boolean;
};

export function calendarEventInviteBody(
  init: CalendarEventInvitePacketInit,
): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.invitee);
  w.uint64LE(init.eventId);
  w.uint64LE(init.inviteId);
  w.uint8(init.level);
  w.uint8(init.status);
  const hasTime = init.statusTime !== undefined;
  w.uint8(hasTime ? 1 : 0);
  if (init.statusTime !== undefined)
    w.uint32LE(packCalendarTime(init.statusTime));
  w.uint8(init.invited === false ? 0 : 1);
  return w.finish();
}

export function calendarInviteRemovedBody(init: {
  invitee: bigint;
  eventId: bigint;
  flags: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.invitee);
  w.uint64LE(init.eventId);
  w.uint32LE(init.flags);
  w.uint8(1);
  return w.finish();
}

export function calendarEventStatusBody(init: {
  invitee: bigint;
  eventId: bigint;
  time: PackedTime;
  flags: number;
  status: number;
  rank: number;
  statusTime: PackedTime;
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.invitee);
  w.uint64LE(init.eventId);
  w.uint32LE(packCalendarTime(init.time));
  w.uint32LE(init.flags);
  w.uint8(init.status);
  w.uint8(init.rank);
  w.uint32LE(packCalendarTime(init.statusTime));
  return w.finish();
}

export function calendarInviteAlertBody(init: {
  eventId: bigint;
  title: string;
  time: PackedTime;
  flags: number;
  type: number;
  dungeonId: number;
  inviteId: bigint;
  status: number;
  rank: number;
  creator: bigint;
  sender: bigint;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.eventId);
  w.cString(init.title);
  w.uint32LE(packCalendarTime(init.time));
  w.uint32LE(init.flags);
  w.uint32LE(init.type);
  w.uint32LE(init.dungeonId >>> 0);
  w.uint64LE(init.inviteId);
  w.uint8(init.status);
  w.uint8(init.rank);
  w.packedGuidBig(init.creator);
  w.packedGuidBig(init.sender);
  return w.finish();
}

export function calendarInviteRemovedAlertBody(init: {
  eventId: bigint;
  time: PackedTime;
  flags: number;
  status: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.eventId);
  w.uint32LE(packCalendarTime(init.time));
  w.uint32LE(init.flags);
  w.uint8(init.status);
  return w.finish();
}

export function calendarRemovedAlertBody(init: {
  eventId: bigint;
  time: PackedTime;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint8(1);
  w.uint64LE(init.eventId);
  w.uint32LE(packCalendarTime(init.time));
  return w.finish();
}

export function calendarUpdatedAlertBody(init: {
  eventId: bigint;
  oldTime: PackedTime;
  flags: number;
  time: PackedTime;
  type: number;
  dungeonId: number;
  title: string;
  description: string;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint8(1);
  w.uint64LE(init.eventId);
  w.uint32LE(packCalendarTime(init.oldTime));
  w.uint32LE(init.flags);
  w.uint32LE(packCalendarTime(init.time));
  w.uint8(init.type);
  w.uint32LE(init.dungeonId >>> 0);
  w.cString(init.title);
  w.cString(init.description);
  w.uint8(0);
  w.uint32LE(100);
  w.uint32LE(0);
  return w.finish();
}

export function calendarModeratorAlertBody(init: {
  invitee: bigint;
  eventId: bigint;
  rank: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.invitee);
  w.uint64LE(init.eventId);
  w.uint8(init.rank);
  w.uint8(1);
  return w.finish();
}

export function calendarLockoutAddedBody(init: {
  time: PackedTime;
  mapId: number;
  difficulty: number;
  secondsLeft: number;
  instanceGuid: bigint;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(packCalendarTime(init.time));
  w.uint32LE(init.mapId);
  w.uint32LE(init.difficulty);
  w.uint32LE(init.secondsLeft);
  w.uint64LE(init.instanceGuid);
  return w.finish();
}

export function calendarLockoutRemovedBody(init: {
  mapId: number;
  difficulty: number;
  secondsLeft: number;
  instanceGuid: bigint;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.mapId);
  w.uint32LE(init.difficulty);
  w.uint32LE(init.secondsLeft);
  w.uint64LE(init.instanceGuid);
  return w.finish();
}

export function calendarLockoutUpdatedBody(init: {
  time: PackedTime;
  mapId: number;
  difficulty: number;
  oldSeconds: number;
  newSeconds: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(packCalendarTime(init.time));
  w.uint32LE(init.mapId);
  w.uint32LE(init.difficulty);
  w.uint32LE(init.oldSeconds);
  w.uint32LE(init.newSeconds);
  return w.finish();
}
