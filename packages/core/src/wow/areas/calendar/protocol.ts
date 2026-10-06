import { type PackedTime, writePackedTime } from "#wow/protocol/packed-time";
import { PacketWriter } from "#wow/protocol/packet";

export const CalendarFlag = {
  AllAllowed: 0x001,
  InvitesLocked: 0x010,
  WithoutInvites: 0x040,
  GuildEvent: 0x400,
} as const;

export const CalendarRank = {
  Player: 0,
  Moderator: 1,
  Owner: 2,
} as const;

export const CalendarSendType = {
  Get: 0,
  Add: 1,
  Copy: 2,
} as const;

export const CalendarStatus = {
  Invited: 0,
  Accepted: 1,
  Declined: 2,
  Confirmed: 3,
  Out: 4,
  Standby: 5,
  SignedUp: 6,
  NotSignedUp: 7,
  Tentative: 8,
  Removed: 9,
} as const;

export const CalendarError = {
  GuildEventsExceeded: 1,
  EventsExceeded: 2,
  SelfInvitesExceeded: 3,
  OtherInvitesExceeded: 4,
  Permissions: 5,
  EventInvalid: 6,
  NotInvited: 7,
  Internal: 8,
  GuildPlayerNotInGuild: 9,
  AlreadyInvitedToEvent: 10,
  PlayerNotFound: 11,
  NotAllied: 12,
  IgnoringYou: 13,
  InvitesExceeded: 14,
  InvalidDate: 16,
  InvalidTime: 17,
  NeedsTitle: 19,
  EventPassed: 20,
  EventLocked: 21,
  DeleteCreatorFailed: 22,
  SystemDisabled: 24,
  RestrictedAccount: 25,
  ArenaEventsExceeded: 26,
  RestrictedLevel: 27,
  UserSquelched: 28,
  NoInvite: 29,
  EventWrongServer: 36,
  InviteWrongServer: 37,
  NoGuildInvites: 38,
  InvalidSignup: 39,
  NoModerator: 40,
} as const;

export const CALENDAR_TITLE_MAX = 31;
export const CALENDAR_DESCRIPTION_MAX = 255;
export const CALENDAR_PAST_SLACK_SECONDS = 86400;
export const CALENDAR_CREATE_COOLDOWN_MS = 5000;

export type CalendarEventSpec = {
  title: string;
  description: string;
  type: number;
  repeat: number;
  maxInvites: number;
  dungeonId: number;
  time: PackedTime;
  zoneTime: PackedTime;
  flags: number;
};

export type CalendarInviteSpec = {
  guid: bigint;
  status: number;
  rank: number;
};

function writeSpec(writer: PacketWriter, spec: CalendarEventSpec): void {
  writer.cString(spec.title);
  writer.cString(spec.description);
  writer.uint8(spec.type);
  writer.uint8(spec.repeat);
  writer.uint32LE(spec.maxInvites);
  writer.uint32LE(spec.dungeonId >>> 0);
  writePackedTime(writer, spec.time);
  writePackedTime(writer, spec.zoneTime);
  writer.uint32LE(spec.flags);
}

export function buildGetCalendar(): Uint8Array {
  return new Uint8Array();
}

export function buildGetEvent(eventId: bigint): Uint8Array {
  const writer = new PacketWriter();
  writer.uint64LE(eventId);
  return writer.finish();
}

export function buildGetNumPending(): Uint8Array {
  return new Uint8Array();
}

export function buildAddEvent(
  spec: CalendarEventSpec,
  invites: readonly CalendarInviteSpec[],
): Uint8Array {
  const writer = new PacketWriter();
  writeSpec(writer, spec);
  if ((spec.flags & CalendarFlag.WithoutInvites) === 0) {
    writer.uint32LE(invites.length);
    for (const invite of invites) {
      writer.packedGuidBig(invite.guid);
      writer.uint8(invite.status);
      writer.uint8(invite.rank);
    }
  }
  return writer.finish();
}

export function buildUpdateEvent(
  eventId: bigint,
  inviteId: bigint,
  spec: CalendarEventSpec,
): Uint8Array {
  const writer = new PacketWriter();
  writer.uint64LE(eventId);
  writer.uint64LE(inviteId);
  writeSpec(writer, spec);
  return writer.finish();
}

export function buildRemoveEvent(
  eventId: bigint,
  inviteId: bigint,
  flags: number,
): Uint8Array {
  const writer = new PacketWriter();
  writer.uint64LE(eventId);
  writer.uint64LE(inviteId);
  writer.uint32LE(flags);
  return writer.finish();
}

export function buildCopyEvent(
  eventId: bigint,
  inviteId: bigint,
  time: PackedTime,
): Uint8Array {
  const writer = new PacketWriter();
  writer.uint64LE(eventId);
  writer.uint64LE(inviteId);
  writePackedTime(writer, time);
  return writer.finish();
}

export function buildEventInvite(
  eventId: bigint,
  inviteId: bigint,
  name: string,
  isPreInvite: boolean,
  isGuildEvent: boolean,
): Uint8Array {
  const writer = new PacketWriter();
  writer.uint64LE(eventId);
  writer.uint64LE(inviteId);
  writer.cString(name);
  writer.uint8(isPreInvite ? 1 : 0);
  writer.uint8(isGuildEvent ? 1 : 0);
  return writer.finish();
}

export function buildEventRsvp(
  eventId: bigint,
  inviteId: bigint,
  status: number,
): Uint8Array {
  const writer = new PacketWriter();
  writer.uint64LE(eventId);
  writer.uint64LE(inviteId);
  writer.uint32LE(status);
  return writer.finish();
}

export function buildEventSignup(
  eventId: bigint,
  tentative: boolean,
): Uint8Array {
  const writer = new PacketWriter();
  writer.uint64LE(eventId);
  writer.uint8(tentative ? 1 : 0);
  return writer.finish();
}

export function buildRemoveInvite(
  invitee: bigint,
  inviteId: bigint,
  ownerInviteId: bigint,
  eventId: bigint,
): Uint8Array {
  const writer = new PacketWriter();
  writer.packedGuidBig(invitee);
  writer.uint64LE(inviteId);
  writer.uint64LE(ownerInviteId);
  writer.uint64LE(eventId);
  return writer.finish();
}

function buildInviteChange(
  invitee: bigint,
  eventId: bigint,
  inviteId: bigint,
  ownerInviteId: bigint,
  value: number,
): Uint8Array {
  const writer = new PacketWriter();
  writer.packedGuidBig(invitee);
  writer.uint64LE(eventId);
  writer.uint64LE(inviteId);
  writer.uint64LE(ownerInviteId);
  writer.uint8(value);
  return writer.finish();
}

export function buildEventStatus(
  invitee: bigint,
  eventId: bigint,
  inviteId: bigint,
  ownerInviteId: bigint,
  status: number,
): Uint8Array {
  return buildInviteChange(invitee, eventId, inviteId, ownerInviteId, status);
}

export function buildModeratorStatus(
  invitee: bigint,
  eventId: bigint,
  inviteId: bigint,
  ownerInviteId: bigint,
  rank: number,
): Uint8Array {
  return buildInviteChange(invitee, eventId, inviteId, ownerInviteId, rank);
}

export function buildGuildFilter(
  minLevel: number,
  maxLevel: number,
  minRank: number,
): Uint8Array {
  const writer = new PacketWriter();
  writer.uint32LE(minLevel);
  writer.uint32LE(maxLevel);
  writer.uint32LE(minRank);
  return writer.finish();
}

export function buildArenaTeam(teamId: number): Uint8Array {
  const writer = new PacketWriter();
  writer.uint32LE(teamId);
  return writer.finish();
}

export function buildComplain(eventId: bigint, guid: bigint): Uint8Array {
  const writer = new PacketWriter();
  writer.uint64LE(eventId);
  writer.packedGuidBig(guid);
  return writer.finish();
}
