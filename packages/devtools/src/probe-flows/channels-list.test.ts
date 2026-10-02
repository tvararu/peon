import { describe, expect, spyOn, test } from "bun:test";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/channels-list";

const ME = 0xde1n;
const PARTNER = 0xab2n;

function context(args: Record<string, string>): FlowContext & {
  handle: MockHandle;
} {
  const handle = createMockHandle();
  return { args, handle, settle: settleWithin(50) };
}

function wire(ctx: { handle: MockHandle }, partnerOnList: boolean) {
  spyOn(ctx.handle, "joinChannel").mockImplementation((channel: string) => {
    ctx.handle.triggerAreaEvent("channels", {
      notice: { channel, channelId: 7, flags: 3, type: "you_joined" },
      type: "channel_notice",
    });
  });
  const list = spyOn(ctx.handle.channels.act, "listChannel").mockImplementation(
    async (channel: string) =>
      channel === "peonab12cd"
        ? {
            flags: 3,
            members: partnerOnList
              ? [
                  { flags: 3, guid: ME },
                  { flags: 0, guid: PARTNER },
                ]
              : [{ flags: 3, guid: ME }],
            ok: true,
          }
        : ({ ok: false, reason: "not_member" } as const),
  );
  const count = spyOn(
    ctx.handle.channels.act,
    "channelMemberCount",
  ).mockImplementation(async () => 2);
  return { count, list };
}

describe("channels-list flow", () => {
  test("lists, lists with display, counts, then lists a channel it is not on", async () => {
    const ctx = context({ channel: "peonab12cd" });
    const { count, list } = wire(ctx, true);
    const result = (await flow.run(ctx)) as {
      count: number;
      list: { members: { guid: string }[] };
      notMember: { reason: string };
    };
    expect(list.mock.calls.map((call) => [call[0], call[1]?.display])).toEqual([
      ["peonab12cd", undefined],
      ["peonab12cd", true],
      ["peonab12cdother", undefined],
    ]);
    expect(count.mock.calls.map((call) => call[0])).toEqual(["peonab12cd"]);
    expect(result.count).toBe(2);
    expect(result.list.members.map((member) => member.guid)).toEqual([
      "0xde1",
      "0xab2",
    ]);
    expect(result.notMember.reason).toBe("not_member");
  });

  test("fails when the partner is not on the list", async () => {
    const ctx = context({ channel: "peonab12cd" });
    wire(ctx, false);
    await expect(flow.run(ctx)).rejects.toThrow("partner");
  });

  test("needs the channel name", async () => {
    await expect(flow.run(context({}))).rejects.toThrow("channel");
  });

  test("fails when the list is refused", async () => {
    const ctx = context({ channel: "peonab12cd" });
    wire(ctx, true);
    spyOn(ctx.handle.channels.act, "listChannel").mockImplementation(
      async () => ({ ok: false, reason: "timeout" }) as never,
    );
    await expect(flow.run(ctx)).rejects.toThrow("timeout");
  });
});
