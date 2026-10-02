import type { PacketReader } from "#wow/protocol/packet";

const BARE_TYPES = [
  "wrong_password",
  "not_member",
  "not_moderator",
  "not_owner",
  "muted",
  "banned",
  "invite_wrong_faction",
  "wrong_faction",
  "invalid_name",
  "not_moderated",
  "throttled",
  "not_in_area",
  "not_in_lfg",
] as const;

const GUID_TYPES = [
  "joined",
  "left",
  "password_changed",
  "owner_changed",
  "announcements_on",
  "announcements_off",
  "moderation_on",
  "moderation_off",
  "already_member",
  "voice_on",
  "voice_off",
] as const;

const NAME_TYPES = [
  "player_not_found",
  "player_not_banned",
  "player_invited",
  "invite_banned",
] as const;

const PAIR_TYPES = [
  "player_kicked",
  "player_banned",
  "player_unbanned",
] as const;

type BareType = (typeof BARE_TYPES)[number];
type GuidType = (typeof GUID_TYPES)[number];
type NameType = (typeof NAME_TYPES)[number];
type PairType = (typeof PAIR_TYPES)[number];

export type ChannelNotice =
  | { type: BareType; channel: string }
  | { type: GuidType; channel: string; guid: bigint }
  | { type: NameType; channel: string; name: string }
  | { type: PairType; channel: string; target: bigint; actor: bigint }
  | { type: "invite"; channel: string; inviter: bigint }
  | { type: "channel_owner"; channel: string; owner: string }
  | { type: "you_joined"; channel: string; flags: number; channelId: number }
  | {
      type: "you_left";
      channel: string;
      channelId: number;
      constant: boolean;
    }
  | {
      type: "mode_change";
      channel: string;
      guid: bigint;
      oldFlags: number;
      newFlags: number;
    };

export type ChannelNoticeType = ChannelNotice["type"];

const TYPES: readonly ChannelNoticeType[] = [
  "joined",
  "left",
  "you_joined",
  "you_left",
  "wrong_password",
  "not_member",
  "not_moderator",
  "password_changed",
  "owner_changed",
  "player_not_found",
  "not_owner",
  "channel_owner",
  "mode_change",
  "announcements_on",
  "announcements_off",
  "moderation_on",
  "moderation_off",
  "muted",
  "player_kicked",
  "banned",
  "player_banned",
  "player_unbanned",
  "player_not_banned",
  "already_member",
  "invite",
  "invite_wrong_faction",
  "wrong_faction",
  "invalid_name",
  "not_moderated",
  "player_invited",
  "invite_banned",
  "throttled",
  "not_in_area",
  "not_in_lfg",
  "voice_on",
  "voice_off",
];

export function parseChannelNotice(r: PacketReader): ChannelNotice {
  const code = r.uint8();
  const channel = r.cString();
  const type = TYPES[code];
  if (type === undefined)
    throw new Error(`unknown channel notice 0x${code.toString(16)}`);
  if ((BARE_TYPES as readonly string[]).includes(type))
    return { type: type as BareType, channel };
  if ((GUID_TYPES as readonly string[]).includes(type))
    return { type: type as GuidType, channel, guid: r.uint64LE() };
  if ((NAME_TYPES as readonly string[]).includes(type))
    return { type: type as NameType, channel, name: r.cString() };
  if ((PAIR_TYPES as readonly string[]).includes(type))
    return {
      type: type as PairType,
      channel,
      target: r.uint64LE(),
      actor: r.uint64LE(),
    };
  switch (type) {
    case "invite":
      return { type, channel, inviter: r.uint64LE() };
    case "channel_owner":
      return { type, channel, owner: r.cString() };
    case "you_joined": {
      const flags = r.uint8();
      const channelId = r.uint32LE();
      r.uint32LE();
      return { type, channel, flags, channelId };
    }
    case "you_left": {
      const channelId = r.uint32LE();
      return { type, channel, channelId, constant: r.uint8() !== 0 };
    }
    case "mode_change": {
      const guid = r.uint64LE();
      const oldFlags = r.uint8();
      return { type, channel, guid, oldFlags, newFlags: r.uint8() };
    }
    default:
      throw new Error(`unknown channel notice ${type}`);
  }
}
