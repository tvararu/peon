import { describe, expect, test } from "bun:test";
import {
  channelsChannelNameBody,
  channelsChannelPlayerBody,
  channelsListBody,
  channelsMemberCountBody,
  channelsUserlistBody,
} from "#test-support/areas/channels";
import {
  buildChannelAnnouncements,
  buildChannelBan,
  buildChannelClearWatch,
  buildChannelDeclineInvite,
  buildChannelDisplayList,
  buildChannelInvite,
  buildChannelKick,
  buildChannelList,
  buildChannelMemberCountQuery,
  buildChannelModerate,
  buildChannelModerator,
  buildChannelMute,
  buildChannelOwnerQuery,
  buildChannelPassword,
  buildChannelSetOwner,
  buildChannelUnban,
  buildChannelUnmoderator,
  buildChannelUnmute,
  buildChannelWatch,
  CHANNEL_ADMIN_OPCODES,
  parseChannelList,
  parseChannelMemberCount,
  parseUserlistAdd,
  parseUserlistRemove,
  parseUserlistUpdate,
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
      announcements: GameOpcode.CMSG_CHANNEL_ANNOUNCEMENTS,
      ban: GameOpcode.CMSG_CHANNEL_BAN,
      invite: GameOpcode.CMSG_CHANNEL_INVITE,
      kick: GameOpcode.CMSG_CHANNEL_KICK,
      moderate: GameOpcode.CMSG_CHANNEL_MODERATE,
      moderator: GameOpcode.CMSG_CHANNEL_MODERATOR,
      mute: GameOpcode.CMSG_CHANNEL_MUTE,
      owner: GameOpcode.CMSG_CHANNEL_OWNER,
      password: GameOpcode.CMSG_CHANNEL_PASSWORD,
      set_owner: GameOpcode.CMSG_CHANNEL_SET_OWNER,
      unban: GameOpcode.CMSG_CHANNEL_UNBAN,
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

  test("kick, ban and unban write the channel and player names", () => {
    expect(pairOf(buildChannelKick("peonab12cd", "Partner"))).toEqual([
      "peonab12cd",
      "Partner",
    ]);
    expect(pairOf(buildChannelBan("peonab12cd", "Partner"))).toEqual([
      "peonab12cd",
      "Partner",
    ]);
    expect(pairOf(buildChannelUnban("peonab12cd", "Partner"))).toEqual([
      "peonab12cd",
      "Partner",
    ]);
    expect(buildChannelKick("peonab12cd", "Partner")).toEqual(
      channelsChannelPlayerBody({ channel: "peonab12cd", player: "Partner" }),
    );
  });

  test("announcements and moderate write only the channel name", () => {
    const expected = channelsChannelNameBody({ channel: "peonab12cd" });
    expect(buildChannelAnnouncements("peonab12cd")).toEqual(expected);
    expect(buildChannelModerate("peonab12cd")).toEqual(expected);
  });

  test("watch, clear watch and decline invite write only the channel name", () => {
    const expected = channelsChannelNameBody({ channel: "peonab12cd" });
    expect(buildChannelWatch("peonab12cd")).toEqual(expected);
    expect(buildChannelClearWatch("peonab12cd")).toEqual(expected);
    expect(buildChannelDeclineInvite("peonab12cd")).toEqual(expected);
  });
});

describe("channel userlist wire", () => {
  test("add and update read guid, both flags, count and name", () => {
    const add = channelsUserlistBody({
      change: "add",
      channel: "peonab12cd",
      count: 2,
      flags: 3,
      guid: 0xab2n,
      memberFlags: 1,
    });
    expect(parseUserlistAdd(new PacketReader(add))).toEqual({
      change: "add",
      channel: "peonab12cd",
      count: 2,
      flags: 3,
      guid: 0xab2n,
      memberFlags: 1,
    });
    const update = channelsUserlistBody({
      change: "update",
      channel: "peonab12cd",
      count: 2,
      flags: 3,
      guid: 0xab2n,
      memberFlags: 2,
    });
    expect(parseUserlistUpdate(new PacketReader(update))).toEqual({
      change: "update",
      channel: "peonab12cd",
      count: 2,
      flags: 3,
      guid: 0xab2n,
      memberFlags: 2,
    });
  });

  test("remove reads guid, flags, count and name with no member flags", () => {
    const body = channelsUserlistBody({
      change: "remove",
      channel: "peonab12cd",
      count: 1,
      flags: 3,
      guid: 0xab2n,
    });
    expect(parseUserlistRemove(new PacketReader(body))).toEqual({
      change: "remove",
      channel: "peonab12cd",
      count: 1,
      flags: 3,
      guid: 0xab2n,
      memberFlags: undefined,
    });
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
