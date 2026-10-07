import { GameOpcode } from "#wow/protocol/opcodes";
import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type ChannelAdminAction =
  | "password"
  | "set_owner"
  | "owner"
  | "moderator"
  | "unmoderator"
  | "mute"
  | "unmute"
  | "invite"
  | "kick"
  | "ban"
  | "unban"
  | "announcements"
  | "moderate";

export const CHANNEL_ADMIN_OPCODES: Record<ChannelAdminAction, number> = {
  password: GameOpcode.CMSG_CHANNEL_PASSWORD,
  set_owner: GameOpcode.CMSG_CHANNEL_SET_OWNER,
  owner: GameOpcode.CMSG_CHANNEL_OWNER,
  moderator: GameOpcode.CMSG_CHANNEL_MODERATOR,
  unmoderator: GameOpcode.CMSG_CHANNEL_UNMODERATOR,
  mute: GameOpcode.CMSG_CHANNEL_MUTE,
  unmute: GameOpcode.CMSG_CHANNEL_UNMUTE,
  invite: GameOpcode.CMSG_CHANNEL_INVITE,
  kick: GameOpcode.CMSG_CHANNEL_KICK,
  ban: GameOpcode.CMSG_CHANNEL_BAN,
  unban: GameOpcode.CMSG_CHANNEL_UNBAN,
  announcements: GameOpcode.CMSG_CHANNEL_ANNOUNCEMENTS,
  moderate: GameOpcode.CMSG_CHANNEL_MODERATE,
};

function nameOnly(channel: string): Uint8Array {
  const w = new PacketWriter();
  w.cString(channel);
  return w.finish();
}

function nameAndPlayer(channel: string, player: string): Uint8Array {
  const w = new PacketWriter();
  w.cString(channel);
  w.cString(player);
  return w.finish();
}

export function buildChannelPassword(
  channel: string,
  password: string,
): Uint8Array {
  return nameAndPlayer(channel, password);
}

export function buildChannelSetOwner(
  channel: string,
  player: string,
): Uint8Array {
  return nameAndPlayer(channel, player);
}

export function buildChannelOwnerQuery(channel: string): Uint8Array {
  return nameOnly(channel);
}

export function buildChannelModerator(
  channel: string,
  player: string,
): Uint8Array {
  return nameAndPlayer(channel, player);
}

export function buildChannelUnmoderator(
  channel: string,
  player: string,
): Uint8Array {
  return nameAndPlayer(channel, player);
}

export function buildChannelMute(channel: string, player: string): Uint8Array {
  return nameAndPlayer(channel, player);
}

export function buildChannelUnmute(
  channel: string,
  player: string,
): Uint8Array {
  return nameAndPlayer(channel, player);
}

export function buildChannelInvite(
  channel: string,
  player: string,
): Uint8Array {
  return nameAndPlayer(channel, player);
}

export type ChannelMember = { guid: bigint; flags: number };

export type ChannelList = {
  channel: string;
  flags: number;
  members: readonly ChannelMember[];
};

export type ChannelMemberCount = {
  channel: string;
  flags: number;
  count: number;
};

const LIST_MEMBER_BYTES = 9;

export function buildChannelList(channel: string): Uint8Array {
  return nameOnly(channel);
}

export function buildChannelDisplayList(channel: string): Uint8Array {
  return nameOnly(channel);
}

export function buildChannelMemberCountQuery(channel: string): Uint8Array {
  return nameOnly(channel);
}

export function parseChannelList(r: PacketReader): ChannelList {
  r.uint8();
  const channel = r.cString();
  const flags = r.uint8();
  const count = r.uint32LE();
  if (count * LIST_MEMBER_BYTES > r.remaining)
    throw new RangeError(
      `channel list count ${count} exceeds remaining ${r.remaining}`,
    );
  const members: ChannelMember[] = [];
  for (let i = 0; i < count; i++)
    members.push({ guid: r.uint64LE(), flags: r.uint8() });
  return { channel, flags, members };
}

export function parseChannelMemberCount(r: PacketReader): ChannelMemberCount {
  const channel = r.cString();
  const flags = r.uint8();
  return { channel, flags, count: r.uint32LE() };
}

export function buildChannelKick(channel: string, player: string): Uint8Array {
  return nameAndPlayer(channel, player);
}

export function buildChannelBan(channel: string, player: string): Uint8Array {
  return nameAndPlayer(channel, player);
}

export function buildChannelUnban(channel: string, player: string): Uint8Array {
  return nameAndPlayer(channel, player);
}

export function buildChannelAnnouncements(channel: string): Uint8Array {
  return nameOnly(channel);
}

export function buildChannelModerate(channel: string): Uint8Array {
  return nameOnly(channel);
}

export function buildChannelWatch(channel: string): Uint8Array {
  return nameOnly(channel);
}

export function buildChannelClearWatch(channel: string): Uint8Array {
  return nameOnly(channel);
}

export function buildChannelDeclineInvite(channel: string): Uint8Array {
  return nameOnly(channel);
}

export type UserlistChange = "add" | "update" | "remove";

export type Userlist = {
  change: UserlistChange;
  guid: bigint;
  memberFlags: number | undefined;
  flags: number;
  count: number;
  channel: string;
};

export function parseUserlistAdd(r: PacketReader): Userlist {
  return parseUserlistWithFlags(r, "add");
}

export function parseUserlistUpdate(r: PacketReader): Userlist {
  return parseUserlistWithFlags(r, "update");
}

function parseUserlistWithFlags(
  r: PacketReader,
  change: "add" | "update",
): Userlist {
  const guid = r.uint64LE();
  const memberFlags = r.uint8();
  const flags = r.uint8();
  const count = r.uint32LE();
  return { change, channel: r.cString(), count, flags, guid, memberFlags };
}

export function parseUserlistRemove(r: PacketReader): Userlist {
  const guid = r.uint64LE();
  const flags = r.uint8();
  const count = r.uint32LE();
  return {
    change: "remove",
    channel: r.cString(),
    count,
    flags,
    guid,
    memberFlags: undefined,
  };
}
