import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  channelsModeChangeBody,
  channelsNotifyGuidBody,
  channelsYouJoinedBody,
} from "#test-support/areas/channels";
import { CHANNEL_ADMIN_OPCODES } from "#wow/areas/channels/protocol";
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
      expect(rig.sent.slice(before).map((packet) => packet.opcode)).toEqual([
        CHANNEL_ADMIN_OPCODES.password,
      ]);
      expect(result).toEqual({
        notice: { channel: "peonab12cd", guid: ME, type: "password_changed" },
        ok: true,
      });
    } finally {
      rig.dispose();
    }
  });

  test("a 32-character password sends nothing", async () => {
    const { before, rig } = joined();
    try {
      const result = await rig.handle.act.channelAdmin(
        "peonab12cd",
        "password",
        "x".repeat(32),
      );
      expect(result).toEqual({ ok: false, reason: "too_long" });
      expect(rig.sent.slice(before)).toHaveLength(0);
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

  test("every admin action sends its ChannelHandler opcode", async () => {
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
        await elapse(2_001);
        expect(await run).toEqual({ notice: undefined, ok: true });
      } finally {
        rig.dispose();
      }
    });
  });
});
