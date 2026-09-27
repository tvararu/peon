import { describe, expect, jest, test } from "bun:test";
import { ChatType, PartyOperation, PartyResult } from "@tuicraft/core";
import { socialTool } from "#harness/tools/social";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";

async function world() {
  const { handle, rt } = await createTestRuntime();
  return { handle, rt, tool: socialTool(rt) };
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
    expect(out.text).toBe(
      `DONE whispered Kaelyn: "I'm level 10." (echo confirmed)`,
    );
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
    expect((await runTool(tool, { text: "hello" })).text).toBe(
      'DONE said: "hello" (echo confirmed)',
    );
  });

  test("gives UNCONFIRMED when no echo comes in 2 s", async () => {
    const { handle, tool } = await world();
    handle.sendParty = jest.fn(() => jest.advanceTimersByTime(2000));
    const out = await withFakeTimers(() =>
      runTool(tool, { do: "party", text: "pull now" }),
    );
    expect(out.text).toBe(
      'UNCONFIRMED said to your party: "pull now"; no echo in 2 s.\nNext: journal(about: "log", since: "1m")',
    );
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
    expect(out.text).toBe(
      'FAILED player_not_found: no player named "Kaelyn" is online.\nNext: ask the human: "Is Kaelyn the right name?"',
    );
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
      expect(out.text).toBe(
        "REFUSED secret: the text holds the account name or password.\nNext: write the message again without them.",
      );
    }
    expect(handle.sendSay).not.toHaveBeenCalled();
  });

  test("refuses chat without text and a whisper or invite without a name", async () => {
    const { tool } = await world();
    expect((await runTool(tool, { do: "whisper", to: "Kaelyn" })).text).toBe(
      'REFUSED missing_text: whisper needs text.\nNext: social(do: "whisper", text: "…", to: "Kaelyn")',
    );
    expect((await runTool(tool, { do: "invite" })).text).toBe(
      'REFUSED missing_name: invite needs the exact player name in to.\nNext: ask the human: "Which player do you mean?"',
    );
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
    expect((await runTool(tool, { do: "invite", to: "Kaelyn" })).text).toBe(
      "DONE invited Kaelyn; the server sent the invite.\nNext: end your turn; a [game] message comes if Kaelyn answers.",
    );
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
    expect((await runTool(tool, { do: "invite", to: "Kaelyn" })).text).toBe(
      'FAILED already_in_group: the server refused the invite to Kaelyn.\nNext: ask the human: "The invite to Kaelyn failed (already_in_group). What should I do?"',
    );
  });

  test("invite is UNCONFIRMED after 3 s without an answer (design B.9)", async () => {
    const { handle, tool } = await world();
    handle.invite = jest.fn(() => jest.advanceTimersByTime(3000));
    const out = await withFakeTimers(() =>
      runTool(tool, { do: "invite", to: "Kaelyn" }),
    );
    expect(out.text).toBe(
      "UNCONFIRMED invited Kaelyn; no answer in 3 s.\nNext: end your turn; a [game] message comes if Kaelyn answers.",
    );
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
    expect((await runTool(tool, { do: "accept_invite" })).text).toBe(
      "FAILED nothing_to_accept: there is no invite to accept.\nNext: end your turn and wait for an invite.",
    );
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
    expect((await runTool(tool, { do: "accept_invite" })).text).toBe(
      "DONE joined the group of Kaelyn.",
    );
  });

  test("leave_group refuses outside a group", async () => {
    const { handle, tool } = await world();
    expect((await runTool(tool, { do: "leave_group" })).text).toBe(
      'REFUSED not_in_group: you are not in a group.\nNext: ask the human: "I am not in a group. What should I do?"',
    );
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
