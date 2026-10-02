import type { GuildInfo } from "#wow/areas/guildadmin/protocol";
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
