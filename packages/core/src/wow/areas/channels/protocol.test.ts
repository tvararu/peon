import { describe, expect, test } from "bun:test";
import {
  channelsChannelNameBody,
  channelsChannelPlayerBody,
} from "#test-support/areas/channels";
import {
  buildChannelInvite,
  buildChannelModerator,
  buildChannelMute,
  buildChannelOwnerQuery,
  buildChannelPassword,
  buildChannelSetOwner,
  buildChannelUnmoderator,
  buildChannelUnmute,
  CHANNEL_ADMIN_OPCODES,
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
