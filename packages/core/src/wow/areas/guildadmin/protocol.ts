import {
  type PackedTime,
  readPackedTime,
  writePackedTime,
} from "#wow/protocol/packed-time";
import type { PacketReader } from "#wow/protocol/packet";
import { PacketWriter } from "#wow/protocol/packet";

export type GuildInfo = {
  name: string;
  created: PackedTime;
  members: number;
  accounts: number;
};

export function parseGuildInfo(r: PacketReader): GuildInfo {
  const name = r.cString();
  const created = readPackedTime(r);
  const members = r.int32LE();
  const accounts = r.int32LE();
  return { name, created, members, accounts };
}

export function guildadminGuildInfoBody(info: GuildInfo): Uint8Array {
  const w = new PacketWriter();
  w.cString(info.name);
  writePackedTime(w, info.created);
  w.uint32LE(info.members);
  w.uint32LE(info.accounts);
  return w.finish();
}

export const GUILD_BANK_MAX_TABS = 6;
export const GUILD_RANK_NAME_MAX = 15;
export const GUILD_NOTE_MAX = 31;
export const GUILD_INFO_TEXT_MAX = 500;
export const GUILD_RANKS_MIN = 5;
export const GUILD_RANKS_MAX = 10;

export const GuildEventLogType = {
  INVITE: 1,
  JOIN: 2,
  PROMOTE: 3,
  DEMOTE: 4,
  UNINVITE: 5,
  LEAVE: 6,
} as const;

export const GuildEmblemResult = {
  SUCCESS: 0,
  INVALID_TABARD_COLORS: 1,
  NO_GUILD: 2,
  NOT_GUILD_MASTER: 3,
  NOT_ENOUGH_MONEY: 4,
  INVALID_VENDOR: 5,
} as const;

export type GuildRankTabRights = { flags: number; slots: number };

export type GuildRankSpec = {
  name: string;
  rights: number;
  goldPerDay: number;
  tabs: readonly GuildRankTabRights[];
};

export type GuildPermissions = {
  rank: number;
  rights: number;
  goldPerDay: number;
  tabCount: number;
  tabs: GuildRankTabRights[];
};

export type GuildEventLogEntry = {
  type: number;
  player: bigint;
  other: bigint | undefined;
  rank: number | undefined;
  secondsAgo: number;
};

export type GuildEmblemSpec = {
  style: number;
  color: number;
  borderStyle: number;
  borderColor: number;
  backgroundColor: number;
};

export function buildGuildRank(
  rankId: number,
  spec: GuildRankSpec,
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(rankId);
  w.uint32LE(spec.rights);
  w.cString(spec.name);
  w.uint32LE(spec.goldPerDay);
  for (let i = 0; i < GUILD_BANK_MAX_TABS; i++) {
    w.uint32LE(spec.tabs[i]?.flags ?? 0);
    w.uint32LE(spec.tabs[i]?.slots ?? 0);
  }
  return w.finish();
}

export function buildGuildAddRank(name: string): Uint8Array {
  const w = new PacketWriter();
  w.cString(name);
  return w.finish();
}

export function buildGuildNote(name: string, note: string): Uint8Array {
  const w = new PacketWriter();
  w.cString(name);
  w.cString(note);
  return w.finish();
}

export function buildGuildInfoText(text: string): Uint8Array {
  const w = new PacketWriter();
  w.cString(text);
  return w.finish();
}

export function buildSaveGuildEmblem(
  npc: bigint,
  emblem: GuildEmblemSpec,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  w.uint32LE(emblem.style);
  w.uint32LE(emblem.color);
  w.uint32LE(emblem.borderStyle);
  w.uint32LE(emblem.borderColor);
  w.uint32LE(emblem.backgroundColor);
  return w.finish();
}

export function buildTabardVendor(npc: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  return w.finish();
}

export function parseGuildPermissions(r: PacketReader): GuildPermissions {
  const rank = r.uint32LE();
  const rights = r.int32LE();
  const goldPerDay = r.int32LE();
  const tabCount = r.uint8();
  const tabs: GuildRankTabRights[] = [];
  for (let i = 0; i < GUILD_BANK_MAX_TABS; i++) {
    tabs.push({ flags: r.int32LE(), slots: r.int32LE() });
  }
  return { rank, rights: rights >>> 0, goldPerDay, tabCount, tabs };
}

export function parseGuildEventLog(r: PacketReader): GuildEventLogEntry[] {
  const count = r.uint8();
  const entries: GuildEventLogEntry[] = [];
  for (let i = 0; i < count; i++) {
    const type = r.uint8();
    const player = r.uint64LE();
    const hasOther =
      type !== GuildEventLogType.JOIN && type !== GuildEventLogType.LEAVE;
    const other = hasOther ? r.uint64LE() : undefined;
    const hasRank =
      type === GuildEventLogType.PROMOTE || type === GuildEventLogType.DEMOTE;
    const rank = hasRank ? r.uint8() : undefined;
    const secondsAgo = r.uint32LE();
    entries.push({ type, player, other, rank, secondsAgo });
  }
  return entries;
}

export function parseSaveEmblemResult(r: PacketReader): number {
  return r.int32LE();
}

export function parseTabardVendor(r: PacketReader): bigint {
  return r.uint64LE();
}
