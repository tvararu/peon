import type { GuildInfo } from "#wow/areas/guildadmin/protocol";
import type {
  GuildEmblem,
  GuildMemberRaw,
  GuildRankRaw,
} from "#wow/protocol/guild";
import { GuildMemberStatus } from "#wow/protocol/guild";
import { writePackedTime } from "#wow/protocol/packed-time";
import { PacketWriter } from "#wow/protocol/packet";

export const GUILDADMIN_ME = 0x0d_10n;

export const GUILDADMIN_INFO: GuildInfo = {
  accounts: 1,
  created: { day: 2, hour: 15, minute: 16, month: 10, weekday: 5, year: 2026 },
  members: 1,
  name: "FacSeedAlpha",
};

export function guildadminGuildInfoBody(info: GuildInfo): Uint8Array {
  const w = new PacketWriter();
  w.cString(info.name);
  writePackedTime(w, info.created);
  w.uint32LE(info.members);
  w.uint32LE(info.accounts);
  return w.finish();
}

export function guildadminGuildEventBody(code: number): Uint8Array {
  const w = new PacketWriter();
  w.uint8(code);
  w.uint8(0);
  return w.finish();
}

export type GuildadminRosterInput = {
  motd: string;
  info: string;
  ranks: GuildRankRaw[];
  members: GuildMemberRaw[];
};

export function guildadminRosterBody(input: GuildadminRosterInput): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(input.members.length);
  w.cString(input.motd);
  w.cString(input.info);
  w.uint32LE(input.ranks.length);
  for (const rank of input.ranks) {
    w.uint32LE(rank.rights);
    w.uint32LE(rank.goldPerDay);
    for (const tab of rank.tabs) {
      w.uint32LE(tab.flags);
      w.uint32LE(tab.slots);
    }
  }
  for (const m of input.members) {
    w.uint64LE(m.guid);
    w.uint8(m.status);
    w.cString(m.name);
    w.uint32LE(m.rankIndex);
    w.uint8(m.level);
    w.uint8(m.playerClass);
    w.uint8(m.gender);
    w.uint32LE(m.area);
    if (m.status === GuildMemberStatus.OFFLINE) w.floatLE(m.timeOffline);
    w.cString(m.publicNote);
    w.cString(m.officerNote);
  }
  return w.finish();
}

export type GuildadminQueryResponseInput = {
  id: number;
  name: string;
  rankNames: string[];
  emblem: GuildEmblem;
  rankCount: number;
};

export function guildadminQueryResponseBody(
  input: GuildadminQueryResponseInput,
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(input.id);
  w.cString(input.name);
  for (let i = 0; i < 10; i++) w.cString(input.rankNames[i] ?? "");
  w.uint32LE(input.emblem.style);
  w.uint32LE(input.emblem.color);
  w.uint32LE(input.emblem.borderStyle);
  w.uint32LE(input.emblem.borderColor);
  w.uint32LE(input.emblem.backgroundColor);
  w.uint32LE(input.rankCount);
  return w.finish();
}

export type GuildadminEventInput = {
  code: number;
  params: string[];
  guid?: bigint;
};

export function guildadminEventBody(input: GuildadminEventInput): Uint8Array {
  const w = new PacketWriter();
  w.uint8(input.code);
  w.uint8(input.params.length);
  for (const p of input.params) w.cString(p);
  if (input.guid !== undefined) w.uint64LE(input.guid);
  return w.finish();
}

export type GuildadminCommandResultInput = {
  command: number;
  name: string;
  result: number;
};

export function guildadminCommandResultBody(
  input: GuildadminCommandResultInput,
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(input.command);
  w.cString(input.name);
  w.uint32LE(input.result);
  return w.finish();
}
