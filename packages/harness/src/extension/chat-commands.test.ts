import { describe, expect, jest, test } from "bun:test";
import { NO_REPLY_TEXT, OFFLINE_TEXT } from "#harness/extension/chat-commands";
import { installCommands } from "#harness/extension/commands";
import {
  createPiRecorder,
  createUiRecorder,
  recorderContext,
} from "#test-support/pi-recorder";
import { createTestRuntime } from "#test-support/runtime-fixture";

async function setup() {
  const runtime = await createTestRuntime();
  const fake = createPiRecorder();
  installCommands(fake.pi, runtime.rt);
  const { ui, named } = createUiRecorder();
  const ctx = recorderContext({ ui });
  const run = (name: string, args = "") => fake.run(name, args, ctx);
  return { ...runtime, named, run };
}

describe("chat commands", () => {
  test("every game slash name sends through its chat call under the world mutex", async () => {
    const { rt, handle, run } = await setup();
    const mutex = jest.spyOn(rt.mutex, "run");
    const calls = [
      [["s", "say"], handle.sendSay],
      [["y", "yell"], handle.sendYell],
      [["p", "party"], handle.sendParty],
      [["g", "guild"], handle.sendGuild],
      [["o", "officer"], handle.sendOfficer],
      [["ra", "raid"], handle.sendRaid],
      [["e", "em", "me", "emote"], handle.sendEmote],
    ] as const;
    for (const [names, send] of calls)
      for (const name of names) {
        await run(name, `  hi from ${name} `);
        expect(send).toHaveBeenLastCalledWith(`hi from ${name}`);
      }
    for (const name of ["w", "whisper", "t", "tell"]) {
      await run(name, `Kaelyn level 10, ${name}?`);
      expect(handle.sendWhisper).toHaveBeenLastCalledWith(
        "Kaelyn",
        `level 10, ${name}?`,
      );
    }
    expect(mutex).toHaveBeenCalledTimes(20);
  });

  test("the input is logged under the name the player typed", async () => {
    const { rt, run } = await setup();
    await run("me", "waves");
    const input = rt.log.recent(10).find((row) => row.event === "human/input");
    expect(input?.data["text"]).toBe("/me waves");
  });

  test("a command with no text shows its usage and sends nothing", async () => {
    const { handle, run, named } = await setup();
    await run("guild", "   ");
    await run("tell", "Kaelyn");
    await run("3");
    const notices = named("notify");
    expect(notices.map(([, level]) => level)).toEqual([
      "warning",
      "warning",
      "warning",
    ]);
    expect(notices[0]?.[0]).toContain("/guild");
    expect(notices[1]?.[0]).toContain("/tell");
    expect(notices[2]?.[0]).toContain("/3");
    expect(handle.sendGuild).not.toHaveBeenCalled();
    expect(handle.sendWhisper).not.toHaveBeenCalled();
    expect(handle.sendChannel).not.toHaveBeenCalled();
  });

  test("/r whispers the last player who whispered, or says nobody has", async () => {
    const { handle, run, named } = await setup();
    await run("r", "hello?");
    expect(handle.sendWhisper).not.toHaveBeenCalled();
    expect(named("notify")).toEqual([[NO_REPLY_TEXT, "warning"]]);
    handle.getReplyTarget = () => "Kaelyn";
    await run("reply", "level 10");
    expect(handle.sendWhisper).toHaveBeenCalledWith("Kaelyn", "level 10");
  });

  test("/1 to /9 write to the joined channel at that number", async () => {
    const { handle, run, named } = await setup();
    handle.getChannel = (index) => (index === 2 ? "Trade - City" : undefined);
    await run("2", "wts linen");
    expect(handle.sendChannel).toHaveBeenCalledWith(
      "Trade - City",
      "wts linen",
    );
    await run("5", "anyone?");
    expect(handle.sendChannel).toHaveBeenCalledTimes(1);
    const [notice] = named("notify");
    expect(named("notify")).toHaveLength(1);
    expect(notice?.[0]).toContain("5");
    expect(notice?.[1]).toBe("warning");
  });

  test("chat commands refuse when the connection is down", async () => {
    const { rt, handle, run, named } = await setup();
    rt.handle = () => undefined;
    await run("s", "hello");
    await run("r", "hello");
    expect(handle.sendSay).not.toHaveBeenCalled();
    expect(named("notify")).toEqual([
      [OFFLINE_TEXT, "error"],
      [OFFLINE_TEXT, "error"],
    ]);
  });
});
