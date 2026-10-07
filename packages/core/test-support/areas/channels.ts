import { PacketWriter } from "#wow/protocol/packet";

export const CHANNEL_NOTICE_CODES = {
  already_member: 0x17,
  announcements_off: 0x0e,
  announcements_on: 0x0d,
  banned: 0x13,
  channel_owner: 0x0b,
  invalid_name: 0x1b,
  invite: 0x18,
  invite_banned: 0x1e,
  invite_wrong_faction: 0x19,
  joined: 0x00,
  left: 0x01,
  mode_change: 0x0c,
  moderation_off: 0x10,
  moderation_on: 0x0f,
  muted: 0x11,
  not_in_area: 0x20,
  not_in_lfg: 0x21,
  not_member: 0x05,
  not_moderated: 0x1c,
  not_moderator: 0x06,
  not_owner: 0x0a,
  owner_changed: 0x08,
  password_changed: 0x07,
  player_banned: 0x14,
  player_invited: 0x1d,
  player_kicked: 0x12,
  player_not_banned: 0x16,
  player_not_found: 0x09,
  player_unbanned: 0x15,
  throttled: 0x1f,
  voice_off: 0x23,
  voice_on: 0x22,
  wrong_faction: 0x1a,
  wrong_password: 0x04,
  you_joined: 0x02,
  you_left: 0x03,
} as const;

export type ChannelNoticeCode = keyof typeof CHANNEL_NOTICE_CODES;

function head(type: ChannelNoticeCode, channel: string): PacketWriter {
  const w = new PacketWriter();
  w.uint8(CHANNEL_NOTICE_CODES[type]);
  w.cString(channel);
  return w;
}

export function channelsNotifyBareBody(init: {
  type:
    | "wrong_password"
    | "not_member"
    | "not_moderator"
    | "not_owner"
    | "muted"
    | "banned"
    | "invite_wrong_faction"
    | "wrong_faction"
    | "invalid_name"
    | "not_moderated"
    | "throttled"
    | "not_in_area"
    | "not_in_lfg";
  channel: string;
}): Uint8Array {
  return head(init.type, init.channel).finish();
}

export function channelsNotifyGuidBody(init: {
  type:
    | "joined"
    | "left"
    | "password_changed"
    | "owner_changed"
    | "announcements_on"
    | "announcements_off"
    | "moderation_on"
    | "moderation_off"
    | "already_member"
    | "invite"
    | "voice_on"
    | "voice_off";
  channel: string;
  guid: bigint;
}): Uint8Array {
  const w = head(init.type, init.channel);
  w.uint64LE(init.guid);
  return w.finish();
}

export function channelsNotifyNameBody(init: {
  type:
    | "player_not_found"
    | "channel_owner"
    | "player_not_banned"
    | "player_invited"
    | "invite_banned";
  channel: string;
  name: string;
}): Uint8Array {
  const w = head(init.type, init.channel);
  w.cString(init.name);
  return w.finish();
}

export function channelsNotifyPairBody(init: {
  type: "player_kicked" | "player_banned" | "player_unbanned";
  channel: string;
  target: bigint;
  actor: bigint;
}): Uint8Array {
  const w = head(init.type, init.channel);
  w.uint64LE(init.target);
  w.uint64LE(init.actor);
  return w.finish();
}

export function channelsYouJoinedBody(init: {
  channel: string;
  flags: number;
  channelId: number;
}): Uint8Array {
  const w = head("you_joined", init.channel);
  w.uint8(init.flags);
  w.uint32LE(init.channelId);
  w.uint32LE(0);
  return w.finish();
}

export function channelsYouLeftBody(init: {
  channel: string;
  channelId: number;
  constant: boolean;
}): Uint8Array {
  const w = head("you_left", init.channel);
  w.uint32LE(init.channelId);
  w.uint8(init.constant ? 1 : 0);
  return w.finish();
}

export function channelsModeChangeBody(init: {
  channel: string;
  guid: bigint;
  oldFlags: number;
  newFlags: number;
}): Uint8Array {
  const w = head("mode_change", init.channel);
  w.uint64LE(init.guid);
  w.uint8(init.oldFlags);
  w.uint8(init.newFlags);
  return w.finish();
}

export function channelsChannelNameBody(init: { channel: string }): Uint8Array {
  const w = new PacketWriter();
  w.cString(init.channel);
  return w.finish();
}

export function channelsChannelPlayerBody(init: {
  channel: string;
  player: string;
}): Uint8Array {
  const w = new PacketWriter();
  w.cString(init.channel);
  w.cString(init.player);
  return w.finish();
}

export function channelsListBody(init: {
  channel: string;
  flags: number;
  members: readonly { guid: bigint; flags: number }[];
  count?: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint8(1);
  w.cString(init.channel);
  w.uint8(init.flags);
  w.uint32LE(init.count ?? init.members.length);
  for (const member of init.members) {
    w.uint64LE(member.guid);
    w.uint8(member.flags);
  }
  return w.finish();
}

export function channelsMemberCountBody(init: {
  channel: string;
  flags: number;
  count: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.cString(init.channel);
  w.uint8(init.flags);
  w.uint32LE(init.count);
  return w.finish();
}

export function channelsUserlistBody(init: {
  change: "add" | "update" | "remove";
  guid: bigint;
  memberFlags?: number;
  flags: number;
  count: number;
  channel: string;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.guid);
  if (init.change !== "remove") w.uint8(init.memberFlags ?? 0);
  w.uint8(init.flags);
  w.uint32LE(init.count);
  w.cString(init.channel);
  return w.finish();
}
