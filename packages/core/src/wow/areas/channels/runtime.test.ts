import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  channelsListBody,
  channelsMemberCountBody,
  channelsModeChangeBody,
  channelsNotifyBareBody,
  channelsNotifyGuidBody,
  channelsYouJoinedBody,
} from "#test-support/areas/channels";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0xde1n;
const PARTNER = 0xab2n;

function joined(channel = "peonab12cd") {
  const rig = areaRig("channels", { selfGuid: ME });
  rig.inject(
    GameOpcode.SMSG_CHANNEL_NOTIFY,
    channelsYouJoinedBody({ channel, channelId: 7, flags: 3 }),
  );
  return { before: rig.sent.length, channel, rig };
}

describe("channels runtime", () => {
  test("password sends 0x09c and resolves with the first notice", async () => {
    const { before, rig } = joined();
    try {
      const pending = rig.handle.act.channelAdmin(
        "peonab12cd",
        "password",
        "abc",
      );
      rig.inject(
        GameOpcode.SMSG_CHANNEL_NOTIFY,
        channelsNotifyGuidBody({
          channel: "peonab12cd",
          guid: ME,
          type: "password_changed",
        }),
      );
      const result = await pending;
      const sent = rig.sent.slice(before);
      expect(sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_CHANNEL_PASSWORD,
      ]);
      expect(sent[0]?.body).toEqual(
        new TextEncoder().encode("peonab12cd\0abc\0"),
      );
      expect(result).toEqual({
        notice: { channel: "peonab12cd", guid: ME, type: "password_changed" },
        ok: true,
      });
    } finally {
      rig.dispose();
    }
  });

  test("a 32-character password sends nothing, a 31-character one is sent", async () => {
    const { before, rig } = joined();
    try {
      const result = await rig.handle.act.channelAdmin(
        "peonab12cd",
        "password",
        "x".repeat(32),
      );
      expect(result).toEqual({ ok: false, reason: "too_long" });
      expect(rig.sent.slice(before)).toHaveLength(0);
      const pending = rig.handle.act.channelAdmin(
        "peonab12cd",
        "password",
        "x".repeat(31),
      );
      rig.inject(
        GameOpcode.SMSG_CHANNEL_NOTIFY,
        channelsNotifyGuidBody({
          channel: "peonab12cd",
          guid: ME,
          type: "password_changed",
        }),
      );
      expect((await pending).ok).toBe(true);
      expect(rig.sent.slice(before).map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_CHANNEL_PASSWORD,
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a missing channel sends nothing", async () => {
    const rig = areaRig("channels", { selfGuid: ME });
    try {
      const result = await rig.handle.act.channelAdmin("peonab12cd", "owner");
      expect(result).toEqual({ ok: false, reason: "not_member" });
      expect(rig.sent).toHaveLength(0);
    } finally {
      rig.dispose();
    }
  });

  test("an empty or spaced player name sends nothing", async () => {
    const { before, rig } = joined();
    try {
      expect(
        await rig.handle.act.channelAdmin("peonab12cd", "moderator", ""),
      ).toEqual({ ok: false, reason: "bad_name" });
      expect(
        await rig.handle.act.channelAdmin("peonab12cd", "mute", "A B"),
      ).toEqual({ ok: false, reason: "bad_name" });
      expect(rig.sent.slice(before)).toHaveLength(0);
    } finally {
      rig.dispose();
    }
  });

  test("moderator sends its ChannelHandler opcode", async () => {
    const { before, rig } = joined();
    try {
      const pending = rig.handle.act.channelAdmin(
        "peonab12cd",
        "moderator",
        "Partner",
      );
      rig.inject(
        GameOpcode.SMSG_CHANNEL_NOTIFY,
        channelsModeChangeBody({
          channel: "peonab12cd",
          guid: PARTNER,
          newFlags: 1,
          oldFlags: 0,
        }),
      );
      const result = await pending;
      expect(rig.sent.slice(before).map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_CHANNEL_MODERATOR,
      ]);
      expect(result.ok).toBe(true);
    } finally {
      rig.dispose();
    }
  });

  test("no notice within 2 s resolves UNCONFIRMED", async () => {
    await withFakeTimers(async () => {
      const { rig } = joined();
      try {
        const pending = rig.handle.act.channelAdmin("peonab12cd", "owner");
        const run = pending.then((result) => result);
        await elapse(2001);
        expect(await run).toEqual({ notice: undefined, ok: true });
      } finally {
        rig.dispose();
      }
    });
  });

  test("listChannel sends 0x09a and resolves with the members", async () => {
    const { before, rig } = joined();
    try {
      const pending = rig.handle.act.listChannel("peonab12cd");
      rig.inject(
        GameOpcode.SMSG_CHANNEL_LIST,
        channelsListBody({
          channel: "peonab12cd",
          flags: 3,
          members: [
            { flags: 3, guid: ME },
            { flags: 0, guid: PARTNER },
          ],
        }),
      );
      expect(await pending).toEqual({
        flags: 3,
        members: [
          { flags: 3, guid: ME },
          { flags: 0, guid: PARTNER },
        ],
        ok: true,
      });
      expect(rig.sent.slice(before).map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_CHANNEL_LIST,
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("listChannel with display sends 0x3d2", async () => {
    const { before, rig } = joined();
    try {
      const pending = rig.handle.act.listChannel("peonab12cd", {
        display: true,
      });
      rig.inject(
        GameOpcode.SMSG_CHANNEL_LIST,
        channelsListBody({ channel: "peonab12cd", flags: 3, members: [] }),
      );
      expect(await pending).toEqual({ flags: 3, members: [], ok: true });
      expect(rig.sent.slice(before).map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_CHANNEL_DISPLAY_LIST,
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("listChannel on a channel we are not on resolves not_member", async () => {
    const rig = areaRig("channels", { selfGuid: ME });
    try {
      const pending = rig.handle.act.listChannel("elsewhere");
      rig.inject(
        GameOpcode.SMSG_CHANNEL_NOTIFY,
        channelsNotifyBareBody({ channel: "elsewhere", type: "not_member" }),
      );
      expect(await pending).toEqual({ ok: false, reason: "not_member" });
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_CHANNEL_LIST,
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("listChannel ignores a list for another channel", async () => {
    await withFakeTimers(async () => {
      const { rig } = joined();
      try {
        const pending = rig.handle.act.listChannel("peonab12cd");
        rig.inject(
          GameOpcode.SMSG_CHANNEL_LIST,
          channelsListBody({ channel: "other", flags: 1, members: [] }),
        );
        await elapse(3001);
        expect(await pending).toEqual({ ok: false, reason: "timeout" });
      } finally {
        rig.dispose();
      }
    });
  });

  test("listChannel stops waiting when its signal aborts", async () => {
    const { rig } = joined();
    try {
      const cancel = new AbortController();
      const pending = rig.handle.act.listChannel("peonab12cd", {
        signal: cancel.signal,
      });
      cancel.abort();
      expect(await pending.catch((error: unknown) => error)).toMatchObject({
        name: "AbortError",
      });
    } finally {
      rig.dispose();
    }
  });

  test("channelMemberCount sends 0x3d4 and resolves the count", async () => {
    const { before, rig } = joined();
    try {
      const pending = rig.handle.act.channelMemberCount("peonab12cd");
      rig.inject(
        GameOpcode.SMSG_CHANNEL_MEMBER_COUNT,
        channelsMemberCountBody({ channel: "peonab12cd", count: 2, flags: 3 }),
      );
      expect(await pending).toBe(2);
      expect(rig.sent.slice(before).map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_GET_CHANNEL_MEMBER_COUNT,
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("channelMemberCount answers for a channel we are not on", async () => {
    const rig = areaRig("channels", { selfGuid: ME });
    try {
      const pending = rig.handle.act.channelMemberCount("elsewhere");
      rig.inject(
        GameOpcode.SMSG_CHANNEL_MEMBER_COUNT,
        channelsMemberCountBody({ channel: "elsewhere", count: 9, flags: 1 }),
      );
      expect(await pending).toBe(9);
    } finally {
      rig.dispose();
    }
  });

  test("channelMemberCount is undefined on not_member and on silence", async () => {
    await withFakeTimers(async () => {
      const rig = areaRig("channels", { selfGuid: ME });
      try {
        const missing = rig.handle.act.channelMemberCount("nowhere");
        rig.inject(
          GameOpcode.SMSG_CHANNEL_NOTIFY,
          channelsNotifyBareBody({ channel: "nowhere", type: "not_member" }),
        );
        expect(await missing).toBeUndefined();
        const silent = rig.handle.act.channelMemberCount("quiet");
        await elapse(3001);
        expect(await silent).toBeUndefined();
      } finally {
        rig.dispose();
      }
    });
  });
});
