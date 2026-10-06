import { describe, expect, spyOn, test } from "bun:test";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/channels-admin";

const PARTNER = 0xab2n;

function context(args: Record<string, string>): FlowContext & {
  handle: MockHandle;
} {
  const handle = createMockHandle();
  return { args, handle, settle: settleWithin(50) };
}

describe("channels-admin flow", () => {
  test("joins, then runs the thirteen admin actions and prints each notice", async () => {
    const ctx = context({ channel: "peonab12cd", partner: "Partner" });
    const join = spyOn(ctx.handle, "joinChannel").mockImplementation(
      (channel: string) => {
        ctx.handle.triggerAreaEvent("channels", {
          notice: {
            channel,
            channelId: 7,
            flags: 3,
            type: "you_joined",
          },
          type: "channel_notice",
        });
      },
    );
    const admin = spyOn(
      ctx.handle.channels.act,
      "channelAdmin",
    ).mockImplementation(async (channel: string, _action: string) => {
      ctx.handle.triggerAreaEvent("channels", {
        notice: { channel, type: "not_member" },
        type: "channel_notice",
      });
      return {
        notice: { channel, guid: PARTNER, type: "password_changed" },
        ok: true,
      } as never;
    });
    const result = (await flow.run(ctx)) as {
      channel: string;
      notices: { action: string }[];
    };
    expect(join).toHaveBeenCalledWith("peonab12cd");
    expect(admin.mock.calls.map((call) => call[1])).toEqual([
      "owner",
      "password",
      "moderator",
      "unmoderator",
      "mute",
      "unmute",
      "set_owner",
      "invite",
      "announcements",
      "moderate",
      "kick",
      "ban",
      "unban",
    ]);
    expect(result.channel).toBe("peonab12cd");
    expect(result.notices).toHaveLength(13);
  });
  test("needs the channel and partner names", async () => {
    await expect(flow.run(context({ partner: "P" }))).rejects.toThrow(
      "channel",
    );
    await expect(flow.run(context({ channel: "c" }))).rejects.toThrow(
      "partner",
    );
  });

  test("reports a refused admin action", async () => {
    const ctx = context({ channel: "peonab12cd", partner: "Partner" });
    spyOn(ctx.handle, "joinChannel").mockImplementation((channel: string) => {
      ctx.handle.triggerAreaEvent("channels", {
        notice: { channel, channelId: 7, flags: 3, type: "you_joined" },
        type: "channel_notice",
      });
    });
    spyOn(ctx.handle.channels.act, "channelAdmin").mockImplementation(
      async () => ({ ok: false, reason: "not_member" }) as never,
    );
    await expect(flow.run(ctx)).rejects.toThrow("not_member");
  });
});
