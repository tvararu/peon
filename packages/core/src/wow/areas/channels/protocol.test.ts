import { describe, expect, test } from "bun:test";
import {
  channelsChannelNameBody,
  channelsChannelPlayerBody,
  channelsListBody,
  channelsMemberCountBody,
} from "#test-support/areas/channels";
import {
  buildChannelDisplayList,
  buildChannelInvite,
  buildChannelList,
  buildChannelMemberCountQuery,
  buildChannelModerator,
  buildChannelMute,
  buildChannelOwnerQuery,
  buildChannelPassword,
  buildChannelSetOwner,
  buildChannelUnmoderator,
  buildChannelUnmute,
  CHANNEL_ADMIN_OPCODES,
  parseChannelList,
  parseChannelMemberCount,
} from "#wow/areas/channels/protocol";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

function nameOf(body: Uint8Array): string {
  return new PacketReader(body).cString();
}

function pairOf(body: Uint8Array): [string, string] {
  const r = new PacketReader(body);
  return [r.cString(), r.cString()];
}

describe("channel admin sends", () => {
  test("admin sends use the ChannelHandler opcodes", () => {
    expect(CHANNEL_ADMIN_OPCODES).toEqual({
      invite: GameOpcode.CMSG_CHANNEL_INVITE,
      moderator: GameOpcode.CMSG_CHANNEL_MODERATOR,
      mute: GameOpcode.CMSG_CHANNEL_MUTE,
      owner: GameOpcode.CMSG_CHANNEL_OWNER,
      password: GameOpcode.CMSG_CHANNEL_PASSWORD,
      set_owner: GameOpcode.CMSG_CHANNEL_SET_OWNER,
      unmoderator: GameOpcode.CMSG_CHANNEL_UNMODERATOR,
      unmute: GameOpcode.CMSG_CHANNEL_UNMUTE,
    });
  });

  test("password writes the channel name and the password", () => {
    const body = buildChannelPassword("peonab12cd", "abc");
    expect(pairOf(body)).toEqual(["peonab12cd", "abc"]);
    expect(body).toEqual(
      channelsChannelPlayerBody({ channel: "peonab12cd", player: "abc" }),
    );
  });

  test("set_owner writes the channel name and the player name", () => {
    const body = buildChannelSetOwner("peonab12cd", "Partner");
    expect(pairOf(body)).toEqual(["peonab12cd", "Partner"]);
    expect(body).toEqual(
      channelsChannelPlayerBody({ channel: "peonab12cd", player: "Partner" }),
    );
  });

  test("owner query writes only the channel name", () => {
    const body = buildChannelOwnerQuery("peonab12cd");
    expect(nameOf(body)).toBe("peonab12cd");
    expect(body).toEqual(channelsChannelNameBody({ channel: "peonab12cd" }));
  });

  test("moderator and unmoderator write the channel and player names", () => {
    expect(pairOf(buildChannelModerator("peonab12cd", "Partner"))).toEqual([
      "peonab12cd",
      "Partner",
    ]);
    expect(pairOf(buildChannelUnmoderator("peonab12cd", "Partner"))).toEqual([
      "peonab12cd",
      "Partner",
    ]);
  });

  test("mute and unmute write the channel and player names", () => {
    expect(pairOf(buildChannelMute("peonab12cd", "Partner"))).toEqual([
      "peonab12cd",
      "Partner",
    ]);
    expect(pairOf(buildChannelUnmute("peonab12cd", "Partner"))).toEqual([
      "peonab12cd",
      "Partner",
    ]);
  });

  test("invite writes the channel and player names", () => {
    expect(pairOf(buildChannelInvite("peonab12cd", "Partner"))).toEqual([
      "peonab12cd",
      "Partner",
    ]);
  });
});

describe("channel list wire", () => {
  test("the list, display and count requests write only the channel name", () => {
    const expected = channelsChannelNameBody({ channel: "peonab12cd" });
    expect(buildChannelList("peonab12cd")).toEqual(expected);
    expect(buildChannelDisplayList("peonab12cd")).toEqual(expected);
    expect(buildChannelMemberCountQuery("peonab12cd")).toEqual(expected);
  });

  test("parseChannelList skips the leading byte and reads each member", () => {
    const body = channelsListBody({
      channel: "peonab12cd",
      flags: 3,
      members: [
        { flags: 0x03, guid: 0xde1n },
        { flags: 0x00, guid: 0xab2n },
      ],
    });
    expect(parseChannelList(new PacketReader(body))).toEqual({
      channel: "peonab12cd",
      flags: 3,
      members: [
        { flags: 0x03, guid: 0xde1n },
        { flags: 0x00, guid: 0xab2n },
      ],
    });
  });

  test("parseChannelList reads an empty list", () => {
    const body = channelsListBody({
      channel: "peonab12cd",
      flags: 1,
      members: [],
    });
    expect(parseChannelList(new PacketReader(body)).members).toEqual([]);
  });

  test("parseChannelList rejects a count larger than the packet", () => {
    const body = channelsListBody({
      channel: "peonab12cd",
      count: 5000,
      flags: 1,
      members: [{ flags: 0, guid: 0xde1n }],
    });
    expect(() => parseChannelList(new PacketReader(body))).toThrow();
  });

  test("parseChannelMemberCount reads name, flags and count", () => {
    const body = channelsMemberCountBody({
      channel: "peonab12cd",
      count: 2,
      flags: 3,
    });
    expect(parseChannelMemberCount(new PacketReader(body))).toEqual({
      channel: "peonab12cd",
      count: 2,
      flags: 3,
    });
  });
});
