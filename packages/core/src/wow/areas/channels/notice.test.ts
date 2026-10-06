import { describe, expect, test } from "bun:test";
import {
  CHANNEL_NOTICE_CODES,
  channelsModeChangeBody,
  channelsNotifyBareBody,
  channelsNotifyGuidBody,
  channelsNotifyNameBody,
  channelsNotifyPairBody,
  channelsYouJoinedBody,
  channelsYouLeftBody,
} from "#test-support/areas/channels";
import { parseChannelNotice } from "#wow/areas/channels/notice";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

const ME = 0xde1n;
const PARTNER = 0xab2n;

const GUID_CASES = [
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

describe("channel notice packets", () => {
  test("you_joined reads the flags, channel id and trailing word", () => {
    const reader = new PacketReader(
      channelsYouJoinedBody({ channel: "peonab12cd", channelId: 7, flags: 3 }),
    );
    expect(parseChannelNotice(reader)).toEqual({
      channel: "peonab12cd",
      channelId: 7,
      flags: 3,
      type: "you_joined",
    });
    expect(reader.remaining).toBe(0);
  });

  test("you_left reads the channel id and the constant flag", () => {
    const reader = new PacketReader(
      channelsYouLeftBody({
        channel: "peonab12cd",
        channelId: 9,
        constant: false,
      }),
    );
    expect(parseChannelNotice(reader)).toEqual({
      channel: "peonab12cd",
      channelId: 9,
      constant: false,
      type: "you_left",
    });
    expect(reader.remaining).toBe(0);
  });

  test("mode_change reads the guid and both flag bytes", () => {
    const reader = new PacketReader(
      channelsModeChangeBody({
        channel: "peonab12cd",
        guid: ME,
        newFlags: 3,
        oldFlags: 0,
      }),
    );
    expect(parseChannelNotice(reader)).toEqual({
      channel: "peonab12cd",
      guid: ME,
      newFlags: 3,
      oldFlags: 0,
      type: "mode_change",
    });
    expect(reader.remaining).toBe(0);
  });

  test("invite carries the inviter guid", () => {
    const reader = new PacketReader(
      channelsNotifyGuidBody({
        channel: "peonab12cd",
        guid: PARTNER,
        type: "invite",
      }),
    );
    expect(parseChannelNotice(reader)).toEqual({
      channel: "peonab12cd",
      inviter: PARTNER,
      type: "invite",
    });
    expect(reader.remaining).toBe(0);
  });

  test("channel_owner carries the owner name", () => {
    const reader = new PacketReader(
      channelsNotifyNameBody({
        channel: "peonab12cd",
        name: "Nobody",
        type: "channel_owner",
      }),
    );
    expect(parseChannelNotice(reader)).toEqual({
      channel: "peonab12cd",
      owner: "Nobody",
      type: "channel_owner",
    });
    expect(reader.remaining).toBe(0);
  });

  test("kicked, banned and unbanned carry target and actor", () => {
    for (const type of [
      "player_kicked",
      "player_banned",
      "player_unbanned",
    ] as const) {
      const reader = new PacketReader(
        channelsNotifyPairBody({
          actor: ME,
          channel: "peonab12cd",
          target: PARTNER,
          type,
        }),
      );
      expect(parseChannelNotice(reader)).toEqual({
        actor: ME,
        channel: "peonab12cd",
        target: PARTNER,
        type,
      });
      expect(reader.remaining).toBe(0);
    }
  });

  test("name notices carry the player name", () => {
    for (const type of [
      "player_not_found",
      "player_invited",
      "player_not_banned",
      "invite_banned",
    ] as const) {
      const reader = new PacketReader(
        channelsNotifyNameBody({ channel: "peonab12cd", name: "Zed", type }),
      );
      expect(parseChannelNotice(reader)).toEqual({
        channel: "peonab12cd",
        name: "Zed",
        type,
      });
      expect(reader.remaining).toBe(0);
    }
  });

  test("every guid notice round-trips its trailing guid", () => {
    for (const type of GUID_CASES) {
      const reader = new PacketReader(
        channelsNotifyGuidBody({ channel: "peonab12cd", guid: ME, type }),
      );
      expect(parseChannelNotice(reader)).toEqual({
        channel: "peonab12cd",
        guid: ME,
        type,
      });
      expect(reader.remaining).toBe(0);
    }
  });

  test.each([
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
  ] as const)("bare notice %s reads only the channel", (type) => {
    const reader = new PacketReader(
      channelsNotifyBareBody({ channel: "peonab12cd", type }),
    );
    expect(parseChannelNotice(reader)).toEqual({
      channel: "peonab12cd",
      type,
    });
    expect(reader.remaining).toBe(0);
  });

  test("notice codes match the AzerothCore ChatNotify order", () => {
    expect(CHANNEL_NOTICE_CODES).toEqual({
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
    });
  });

  test("an unknown notice code throws", () => {
    const w = new PacketWriter();
    w.uint8(0x30);
    w.cString("peonab12cd");
    expect(() => parseChannelNotice(new PacketReader(w.finish()))).toThrow(
      "unknown channel notice",
    );
  });
});
