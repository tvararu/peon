import { describe, expect, test } from "bun:test";
import { installGuards, LOGIN_NOTE } from "#harness/extension/guards";
import { createFakePi } from "#test-support/fake-pi";
import { createTestRuntime } from "#test-support/runtime-fixture";

async function setup(mode: "tui" | "print" = "tui") {
  const { rt } = await createTestRuntime();
  const fake = createFakePi(mode);
  installGuards(fake.api, rt);
  await fake.emit({ reason: "startup", type: "session_start" });
  return { fake, rt };
}

describe("installGuards", () => {
  test("refuses a user shell command", async () => {
    const { fake } = await setup();
    const [result] = await fake.emit({
      command: "ls",
      cwd: "/",
      excludeFromContext: false,
      type: "user_bash",
    });
    expect(result).toEqual({
      result: {
        cancelled: false,
        exitCode: 1,
        output: "Shell commands are off in the harness.",
        truncated: false,
      },
    });
  });

  test.each(["/login", "/logout", "/login openai-codex"])(
    "swallows Enter on %s and prints a human-only line",
    async (text) => {
      const { fake, rt } = await setup();
      fake.ui.editor = text;
      expect(fake.typeRaw("\r")).toEqual([{ consume: true }]);
      expect(fake.ui.editor).toBe("");
      expect(fake.ui.notes).toEqual([LOGIN_NOTE]);
      expect(rt.log.recent(1)[0]).toMatchObject({
        event: "human/input",
        text: `Human: ${text} (blocked)`,
      });
    },
  );

  test("lets other text and other keys through", async () => {
    const { fake } = await setup();
    fake.ui.editor = "/loginx";
    expect(fake.typeRaw("\r")).toEqual([undefined]);
    fake.ui.editor = "/login";
    expect(fake.typeRaw("a")).toEqual([undefined]);
    expect(fake.ui.editor).toBe("/login");
  });

  test("adds no terminal listener outside the TUI and removes it on shutdown", async () => {
    const { fake: print } = await setup("print");
    expect(print.ui.inputs).toEqual([]);
    const { fake } = await setup();
    expect(fake.ui.inputs.length).toBe(1);
    await fake.emit({ reason: "reload", type: "session_shutdown" });
    expect(fake.ui.inputs).toEqual([]);
  });
});
