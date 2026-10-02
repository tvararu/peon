import { type PackedTime, readPackedTime } from "#wow/protocol/packed-time";
import type { PacketReader } from "#wow/protocol/packet";

export const CALENDAR_HOLIDAY_DATES = 26;
export const CALENDAR_HOLIDAY_DURATIONS = 10;
export const CALENDAR_HOLIDAY_FLAGS = 10;

export const CALENDAR_MAX_INVITES = 100;

export type CalendarInvite = {
  readonly eventId: bigint;
  readonly inviteId: bigint;
  readonly status: number;
  readonly rank: number;
  readonly guildEvent: boolean;
  readonly creator: bigint;
};

export type CalendarListEvent = {
  readonly id: bigint;
  readonly title: string;
  readonly type: number;
  readonly time: PackedTime;
  readonly flags: number;
  readonly dungeonId: number;
  readonly creator: bigint;
};

export type CalendarBind = {
  readonly mapId: number;
  readonly difficulty: number;
  readonly secondsLeft: number;
  readonly instanceGuid: bigint;
};

export type CalendarReset = {
  readonly mapId: number;
  readonly period: number;
  readonly offset: number;
};

export type CalendarHoliday = {
  readonly id: number;
  readonly region: number;
  readonly looping: number;
  readonly priority: number;
  readonly filterType: number;
  readonly dates: readonly number[];
  readonly durations: readonly number[];
  readonly flags: readonly number[];
  readonly texture: string;
};

export type CalendarSendCalendar = {
  readonly invites: readonly CalendarInvite[];
  readonly events: readonly CalendarListEvent[];
  readonly serverTime: number;
  readonly zoneTime: PackedTime;
  readonly binds: readonly CalendarBind[];
  readonly relationTime: number;
  readonly resets: readonly CalendarReset[];
  readonly holidays: readonly CalendarHoliday[];
};

export type CalendarEventInvite = {
  readonly invitee: bigint;
  readonly level: number;
  readonly status: number;
  readonly rank: number;
  readonly guildEvent: boolean;
  readonly inviteId: bigint;
  readonly statusTime: PackedTime;
  readonly text: string;
};

export type CalendarSendEvent = {
  readonly sendType: number;
  readonly creator: bigint;
  readonly eventId: bigint;
  readonly title: string;
  readonly description: string;
  readonly type: number;
  readonly repeat: number;
  readonly maxInvites: number;
  readonly dungeonId: number;
  readonly flags: number;
  readonly time: PackedTime;
  readonly zoneTime: PackedTime;
  readonly guildId: number;
  readonly invites: readonly CalendarEventInvite[];
};

export type CalendarNumPending = { readonly pending: number };

export type CalendarCommandResult = {
  readonly error: number;
  readonly name: string;
};

function readFixed(reader: PacketReader, count: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < count; i++) values.push(reader.uint32LE());
  return values;
}

function parseInvite(reader: PacketReader): CalendarInvite {
  const eventId = reader.uint64LE();
  const inviteId = reader.uint64LE();
  const status = reader.uint8();
  const rank = reader.uint8();
  const guildEvent = reader.uint8() !== 0;
  const creator = reader.packedGuidBig();
  return { creator, eventId, guildEvent, inviteId, rank, status };
}

function parseListEvent(reader: PacketReader): CalendarListEvent {
  const id = reader.uint64LE();
  const title = reader.cString();
  const type = reader.uint32LE();
  const time = readPackedTime(reader);
  const flags = reader.uint32LE();
  const dungeonId = reader.int32LE();
  const creator = reader.packedGuidBig();
  return { creator, dungeonId, flags, id, time, title, type };
}

function parseBind(reader: PacketReader): CalendarBind {
  const mapId = reader.uint32LE();
  const difficulty = reader.uint32LE();
  const secondsLeft = reader.uint32LE();
  const instanceGuid = reader.uint64LE();
  return { difficulty, instanceGuid, mapId, secondsLeft };
}

function parseReset(reader: PacketReader): CalendarReset {
  const mapId = reader.int32LE();
  const period = reader.int32LE();
  const offset = reader.int32LE();
  return { mapId, offset, period };
}

function parseHoliday(reader: PacketReader): CalendarHoliday {
  const id = reader.uint32LE();
  const region = reader.uint32LE();
  const looping = reader.uint32LE();
  const priority = reader.uint32LE();
  const filterType = reader.uint32LE();
  const dates = readFixed(reader, CALENDAR_HOLIDAY_DATES);
  const durations = readFixed(reader, CALENDAR_HOLIDAY_DURATIONS);
  const flags = readFixed(reader, CALENDAR_HOLIDAY_FLAGS);
  const texture = reader.cString();
  return {
    dates,
    durations,
    filterType,
    flags,
    id,
    looping,
    priority,
    region,
    texture,
  };
}

export function parseCalendarSendCalendar(
  reader: PacketReader,
): CalendarSendCalendar {
  const inviteCount = reader.uint32LE();
  const invites: CalendarInvite[] = [];
  for (let i = 0; i < inviteCount; i++) invites.push(parseInvite(reader));
  const eventCount = reader.uint32LE();
  const events: CalendarListEvent[] = [];
  for (let i = 0; i < eventCount; i++) events.push(parseListEvent(reader));
  const serverTime = reader.uint32LE();
  const zoneTime = readPackedTime(reader);
  const bindCount = reader.uint32LE();
  const binds: CalendarBind[] = [];
  for (let i = 0; i < bindCount; i++) binds.push(parseBind(reader));
  const relationTime = reader.uint32LE();
  const resetCount = reader.uint32LE();
  const resets: CalendarReset[] = [];
  for (let i = 0; i < resetCount; i++) resets.push(parseReset(reader));
  const holidayCount = reader.uint32LE();
  const holidays: CalendarHoliday[] = [];
  for (let i = 0; i < holidayCount; i++) holidays.push(parseHoliday(reader));
  return {
    binds,
    events,
    holidays,
    invites,
    relationTime,
    resets,
    serverTime,
    zoneTime,
  };
}

function parseEventInvite(reader: PacketReader): CalendarEventInvite {
  const invitee = reader.packedGuidBig();
  const level = reader.uint8();
  const status = reader.uint8();
  const rank = reader.uint8();
  const guildEvent = reader.uint8() !== 0;
  const inviteId = reader.uint64LE();
  const statusTime = readPackedTime(reader);
  const text = reader.cString();
  return {
    guildEvent,
    inviteId,
    invitee,
    level,
    rank,
    status,
    statusTime,
    text,
  };
}

export function parseCalendarSendEvent(
  reader: PacketReader,
): CalendarSendEvent {
  const sendType = reader.uint8();
  const creator = reader.packedGuidBig();
  const eventId = reader.uint64LE();
  const title = reader.cString();
  const description = reader.cString();
  const type = reader.uint8();
  const repeat = reader.uint8();
  const maxInvites = reader.uint32LE();
  const dungeonId = reader.int32LE();
  const flags = reader.uint32LE();
  const time = readPackedTime(reader);
  const zoneTime = readPackedTime(reader);
  const guildId = reader.uint32LE();
  const inviteCount = reader.uint32LE();
  const invites: CalendarEventInvite[] = [];
  for (let i = 0; i < inviteCount; i++) invites.push(parseEventInvite(reader));
  return {
    creator,
    description,
    dungeonId,
    eventId,
    flags,
    guildId,
    invites,
    maxInvites,
    repeat,
    sendType,
    time,
    title,
    type,
    zoneTime,
  };
}

export function parseCalendarSendNumPending(
  reader: PacketReader,
): CalendarNumPending {
  return { pending: reader.uint32LE() };
}

export function parseCalendarCommandResult(
  reader: PacketReader,
): CalendarCommandResult {
  reader.uint32LE();
  reader.uint8();
  const name = reader.cString();
  const error = reader.uint32LE();
  return { error, name };
}
