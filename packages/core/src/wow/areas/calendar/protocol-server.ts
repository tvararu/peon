import { type PackedTime, readPackedTime } from "#wow/protocol/packed-time";
import type { PacketReader } from "#wow/protocol/packet";

export type CalendarFilterMember = {
  readonly guid: bigint;
  readonly level: number;
};

export type CalendarFilterGuild = {
  readonly members: readonly CalendarFilterMember[];
};

export type CalendarArenaMember = {
  readonly guid: bigint;
  readonly unk: number;
};

export type CalendarArenaTeam = {
  readonly members: readonly CalendarArenaMember[];
};

export type CalendarEventInvitePacket = {
  readonly invitee: bigint;
  readonly eventId: bigint;
  readonly inviteId: bigint;
  readonly level: number;
  readonly status: number;
  readonly hasStatusTime: boolean;
  readonly statusTime: PackedTime | undefined;
  readonly invited: boolean;
};

export type CalendarEventInviteRemovedPacket = {
  readonly invitee: bigint;
  readonly eventId: bigint;
  readonly flags: number;
  readonly unk: number;
};

export type CalendarEventStatusPacket = {
  readonly invitee: bigint;
  readonly eventId: bigint;
  readonly time: PackedTime;
  readonly flags: number;
  readonly status: number;
  readonly rank: number;
  readonly statusTime: PackedTime;
};

export type CalendarEventInviteAlert = {
  readonly eventId: bigint;
  readonly title: string;
  readonly time: PackedTime;
  readonly flags: number;
  readonly type: number;
  readonly dungeonId: number;
  readonly inviteId: bigint;
  readonly status: number;
  readonly rank: number;
  readonly creator: bigint;
  readonly sender: bigint;
};

export type CalendarEventInviteRemovedAlert = {
  readonly eventId: bigint;
  readonly time: PackedTime;
  readonly flags: number;
  readonly status: number;
};

export type CalendarEventRemovedAlert = {
  readonly unk: number;
  readonly eventId: bigint;
  readonly time: PackedTime;
};

export type CalendarEventUpdatedAlert = {
  readonly unk: number;
  readonly eventId: bigint;
  readonly oldTime: PackedTime;
  readonly flags: number;
  readonly time: PackedTime;
  readonly type: number;
  readonly dungeonId: number;
  readonly title: string;
  readonly description: string;
  readonly repeat: number;
  readonly maxInvites: number;
  readonly unk2: number;
};

export type CalendarModeratorAlert = {
  readonly invitee: bigint;
  readonly eventId: bigint;
  readonly rank: number;
  readonly unk: number;
};

export type CalendarLockout = {
  readonly time: PackedTime | undefined;
  readonly mapId: number;
  readonly difficulty: number;
  readonly secondsLeft: number;
  readonly instanceGuid: bigint;
};

export type CalendarLockoutUpdated = {
  readonly time: PackedTime;
  readonly mapId: number;
  readonly difficulty: number;
  readonly oldSeconds: number;
  readonly newSeconds: number;
};

export function parseCalendarFilterGuild(
  reader: PacketReader,
): CalendarFilterGuild {
  const count = reader.uint32LE();
  const members: CalendarFilterMember[] = [];
  for (let i = 0; i < count; i++)
    members.push({ guid: reader.packedGuidBig(), level: reader.uint8() });
  return { members };
}

export function parseCalendarArenaTeam(
  reader: PacketReader,
): CalendarArenaTeam {
  const count = reader.uint32LE();
  const members: CalendarArenaMember[] = [];
  for (let i = 0; i < count; i++)
    members.push({ guid: reader.packedGuidBig(), unk: reader.uint8() });
  return { members };
}

export function parseCalendarEventInvite(
  reader: PacketReader,
): CalendarEventInvitePacket {
  const invitee = reader.packedGuidBig();
  const eventId = reader.uint64LE();
  const inviteId = reader.uint64LE();
  const level = reader.uint8();
  const status = reader.uint8();
  const hasStatusTime = reader.uint8() !== 0;
  const statusTime = hasStatusTime ? readPackedTime(reader) : undefined;
  const invited = reader.uint8() !== 0;
  return {
    eventId,
    hasStatusTime,
    invited,
    invitee,
    inviteId,
    level,
    status,
    statusTime,
  };
}

export function parseCalendarEventInviteRemoved(
  reader: PacketReader,
): CalendarEventInviteRemovedPacket {
  const invitee = reader.packedGuidBig();
  const eventId = reader.uint64LE();
  const flags = reader.uint32LE();
  const unk = reader.uint8();
  return { eventId, flags, invitee, unk };
}

export function parseCalendarEventStatus(
  reader: PacketReader,
): CalendarEventStatusPacket {
  const invitee = reader.packedGuidBig();
  const eventId = reader.uint64LE();
  const time = readPackedTime(reader);
  const flags = reader.uint32LE();
  const status = reader.uint8();
  const rank = reader.uint8();
  const statusTime = readPackedTime(reader);
  return { eventId, flags, invitee, rank, status, statusTime, time };
}

export function parseCalendarEventInviteAlert(
  reader: PacketReader,
): CalendarEventInviteAlert {
  const eventId = reader.uint64LE();
  const title = reader.cString();
  const time = readPackedTime(reader);
  const flags = reader.uint32LE();
  const type = reader.uint32LE();
  const dungeonId = reader.int32LE();
  const inviteId = reader.uint64LE();
  const status = reader.uint8();
  const rank = reader.uint8();
  const creator = reader.packedGuidBig();
  const sender = reader.packedGuidBig();
  return {
    creator,
    dungeonId,
    eventId,
    flags,
    inviteId,
    rank,
    sender,
    status,
    time,
    title,
    type,
  };
}

export function parseCalendarEventInviteRemovedAlert(
  reader: PacketReader,
): CalendarEventInviteRemovedAlert {
  const eventId = reader.uint64LE();
  const time = readPackedTime(reader);
  const flags = reader.uint32LE();
  const status = reader.uint8();
  return { eventId, flags, status, time };
}

export function parseCalendarEventRemovedAlert(
  reader: PacketReader,
): CalendarEventRemovedAlert {
  const unk = reader.uint8();
  const eventId = reader.uint64LE();
  const time = readPackedTime(reader);
  return { eventId, time, unk };
}

export function parseCalendarEventUpdatedAlert(
  reader: PacketReader,
): CalendarEventUpdatedAlert {
  const unk = reader.uint8();
  const eventId = reader.uint64LE();
  const oldTime = readPackedTime(reader);
  const flags = reader.uint32LE();
  const time = readPackedTime(reader);
  const type = reader.uint8();
  const dungeonId = reader.int32LE();
  const title = reader.cString();
  const description = reader.cString();
  const repeat = reader.uint8();
  const maxInvites = reader.uint32LE();
  const unk2 = reader.uint32LE();
  return {
    description,
    dungeonId,
    eventId,
    flags,
    maxInvites,
    oldTime,
    repeat,
    time,
    title,
    type,
    unk,
    unk2,
  };
}

export function parseCalendarModeratorAlert(
  reader: PacketReader,
): CalendarModeratorAlert {
  const invitee = reader.packedGuidBig();
  const eventId = reader.uint64LE();
  const rank = reader.uint8();
  const unk = reader.uint8();
  return { eventId, invitee, rank, unk };
}

function parseLockout(
  reader: PacketReader,
  withTime: boolean,
): CalendarLockout {
  const time = withTime ? readPackedTime(reader) : undefined;
  const mapId = reader.uint32LE();
  const difficulty = reader.uint32LE();
  const secondsLeft = reader.uint32LE();
  const instanceGuid = reader.uint64LE();
  return { difficulty, instanceGuid, mapId, secondsLeft, time };
}

export function parseCalendarLockoutAdded(
  reader: PacketReader,
): CalendarLockout {
  return parseLockout(reader, true);
}

export function parseCalendarLockoutRemoved(
  reader: PacketReader,
): CalendarLockout {
  return parseLockout(reader, false);
}

export function parseCalendarLockoutUpdated(
  reader: PacketReader,
): CalendarLockoutUpdated {
  const time = readPackedTime(reader);
  const mapId = reader.uint32LE();
  const difficulty = reader.uint32LE();
  const oldSeconds = reader.uint32LE();
  const newSeconds = reader.uint32LE();
  return { difficulty, mapId, newSeconds, oldSeconds, time };
}
