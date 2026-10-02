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

export function buildGuildCreate(name: string): Uint8Array {
  const w = new PacketWriter();
  w.cString(name);
  return w.finish();
}

export function guildadminGuildInfoBody(info: GuildInfo): Uint8Array {
  const w = new PacketWriter();
  w.cString(info.name);
  writePackedTime(w, info.created);
  w.uint32LE(info.members);
  w.uint32LE(info.accounts);
  return w.finish();
}
