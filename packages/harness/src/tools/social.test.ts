import { describe, expect, jest, test } from "bun:test";
import { ChatType, PartyOperation, PartyResult } from "@peon/core";
import { socialTool } from "#harness/tools/social";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";

async function world() {
  const { handle, rt } = await createTestRuntime();
  return { handle, rt, tool: socialTool.definition(rt) };
}

async function withFakeTimers<T>(body: () => Promise<T>): Promise<T> {
  jest.useFakeTimers();
  try {
    return await body();
  } finally {
    jest.useRealTimers();
  }
}

describe("social", () => {
  test("whispers when to is set, confirmed by the echo", async () => {
    const { handle, tool } = await world();
    handle.sendWhisper = jest.fn((to: string, text: string) =>
      handle.triggerMessage({
        message: text,
        sender: to,
        type: ChatType.WHISPER_INFORM,
      }),
    );
    const out = await runTool(tool, { text: "I'm level 10.", to: "Kaelyn" });
    expect(out.details.result.status).toBe("DONE");
    expect(out.text).toContain("Kaelyn");
    expect(out.text).toContain("I'm level 10.");
    expect(out.details.result.after).toEqual({
      action: "whisper",
      confirmed: true,
      systemLine: undefined,
      text: "I'm level 10.",
      to: "Kaelyn",
    });
    expect(handle.sendWhisper).toHaveBeenCalledWith("Kaelyn", "I'm level 10.");
  });

  test("says when to is not set, confirmed by the echo from the character", async () => {
    const { handle, rt, tool } = await world();
    handle.sendSay = jest.fn((text: string) =>
      handle.triggerMessage({
        message: text,
        sender: rt.profile.character,
        type: ChatType.SAY,
      }),
    );
    const out = await runTool(tool, { text: "hello" });
    expect(out.details.result.status).toBe("DONE");
    expect(out.text).toContain("hello");
    expect(out.text).toContain("said");
  });

  test("gives UNCONFIRMED when no echo comes in 2 s", async () => {
    const { handle, tool } = await world();
    handle.sendParty = jest.fn(() => jest.advanceTimersByTime(2000));
    const out = await withFakeTimers(() =>
      runTool(tool, { do: "party", text: "pull now" }),
    );
    expect(out.details.result).toMatchObject({
      reason: "no_answer",
      status: "UNCONFIRMED",
    });
    expect(out.text).toContain("2 s");
    expect(out.details.result.next).toContain('journal(about: "log"');
  });

  test("fails when the whisper target is not online", async () => {
    const { handle, tool } = await world();
    handle.sendWhisper = jest.fn((to: string) =>
      handle.triggerMessage({
        message: `No player named "${to}" is currently playing.`,
        sender: "",
        type: ChatType.SYSTEM,
      }),
    );
    const out = await runTool(tool, { text: "hi", to: "Kaelyn" });
    expect(out.details.result).toMatchObject({
      reason: "player_not_found",
      status: "FAILED",
    });
    expect(out.details.result.detail).toContain("Kaelyn");
    expect(out.details.result.next).toContain("ask the human");
    expect(out.details.result.next).toContain("Kaelyn");
    expect(out.details.result.after).toMatchObject({
      confirmed: false,
      systemLine: 'No player named "Kaelyn" is currently playing.',
    });
  });

  test("refuses text that holds the account name or the password", async () => {
    const { handle, rt, tool } = await world();
    rt.profile.client.password = "pw1";
    for (const secret of [rt.profile.account.toLowerCase(), "pw1"]) {
      const out = await runTool(tool, { text: `my login is ${secret}` });
      expect(out.details.result).toMatchObject({
        reason: "secret",
        status: "REFUSED",
      });
      expect(out.details.result.next).toContain("write the message again");
    }
    expect(handle.sendSay).not.toHaveBeenCalled();
  });

  test("refuses chat without text and a whisper or invite without a name", async () => {
    const { tool } = await world();
    const whisper = await runTool(tool, { do: "whisper", to: "Kaelyn" });
    expect(whisper.details.result).toMatchObject({
      reason: "missing_text",
      status: "REFUSED",
    });
    expect(whisper.details.result.next).toContain('social(do: "whisper"');
    const invite = (await runTool(tool, { do: "invite" })).details.result;
    expect(invite).toMatchObject({ reason: "missing_name", status: "REFUSED" });
    expect(invite.next).toStartWith("ask the human:");
  });

  test("invite is DONE when the server sends the invite", async () => {
    const { handle, tool } = await world();
    handle.invite = jest.fn((name: string) =>
      handle.triggerGroupEvent({
        operation: PartyOperation.INVITE,
        result: PartyResult.SUCCESS,
        target: name,
        type: "command_result",
      }),
    );
    const out = await runTool(tool, { do: "invite", to: "Kaelyn" });
    expect(out.details.result.status).toBe("DONE");
    expect(out.text).toContain("invited");
    expect(out.text).toContain("Kaelyn");
    expect(out.details.result.next).toContain("end your turn");
    expect(out.details.result.next).toContain("Kaelyn");
  });

  test("invite fails with the party result word", async () => {
    const { handle, tool } = await world();
    handle.invite = jest.fn((name: string) =>
      handle.triggerGroupEvent({
        operation: PartyOperation.INVITE,
        result: PartyResult.ALREADY_IN_GROUP,
        target: name,
        type: "command_result",
      }),
    );
    const { result } = (await runTool(tool, { do: "invite", to: "Kaelyn" }))
      .details;
    expect(result).toMatchObject({
      reason: "already_in_group",
      status: "FAILED",
    });
    expect(result.next).toStartWith("ask the human:");
  });

  test("invite is UNCONFIRMED after 3 s without an answer (design B.9)", async () => {
    const { handle, tool } = await world();
    handle.invite = jest.fn(() => jest.advanceTimersByTime(3000));
    const out = await withFakeTimers(() =>
      runTool(tool, { do: "invite", to: "Kaelyn" }),
    );
    expect(out.details.result).toMatchObject({
      reason: "no_answer",
      status: "UNCONFIRMED",
    });
    expect(out.text).toContain("3 s");
    expect(out.details.result.next).toContain("end your turn");
    expect(out.details.result.next).toContain("Kaelyn");
  });

  test("accept_invite reads the fake SYSTEM line when nothing waits", async () => {
    const { handle, tool } = await world();
    handle.acceptInvite = jest.fn(() =>
      handle.triggerMessage({
        message: "Nothing to accept.",
        sender: "",
        type: ChatType.SYSTEM,
      }),
    );
    const { result } = (await runTool(tool, { do: "accept_invite" })).details;
    expect(result).toMatchObject({
      reason: "nothing_to_accept",
      status: "FAILED",
    });
    expect(result.next).toContain("end your turn");
  });

  test("accept_invite is DONE on the group list", async () => {
    const { handle, tool } = await world();
    const members = [{ guidHigh: 0, guidLow: 7, name: "Kaelyn", online: true }];
    handle.acceptInvite = jest.fn(() =>
      handle.triggerGroupEvent({
        change: { added: ["Kaelyn"], formed: true, removed: [] },
        leader: "Kaelyn",
        loot: null,
        members,
        type: "group_list",
      }),
    );
    const out = await runTool(tool, { do: "accept_invite" });
    expect(out.details.result.status).toBe("DONE");
    expect(out.text).toContain("Kaelyn");
  });

  test("leave_group refuses outside a group", async () => {
    const { handle, tool } = await world();
    const { result } = (await runTool(tool, { do: "leave_group" })).details;
    expect(result).toMatchObject({
      reason: "not_in_group",
      status: "REFUSED",
    });
    expect(result.next).toStartWith("ask the human:");
    expect(handle.leaveGroup).not.toHaveBeenCalled();
  });

  test("the design whisper example fits the limits", async () => {
    const { handle, tool } = await world();
    handle.sendWhisper = jest.fn((to: string, text: string) =>
      handle.triggerMessage({
        message: text,
        sender: to,
        type: ChatType.WHISPER_INFORM,
      }),
    );
    const { text: content } = await runTool(tool, {
      text: "x".repeat(255),
      to: "Kaelyn",
    });
    expect(content.split("\n").length).toBeLessThanOrEqual(12);
    expect(Buffer.byteLength(content)).toBeLessThanOrEqual(700);
  });
});
