import { describe, expect, test } from "bun:test";
import { installInput } from "#harness/extension/input";
import { createFakePi } from "#test-support/fake-pi";
import { createTestRuntime } from "#test-support/runtime-fixture";

async function setup() {
  const { rt } = await createTestRuntime();
  const fake = createFakePi();
  installInput(fake.api, rt);
  return { fake, rt };
}

describe("installInput", () => {
  test("tracks the agent state through a turn", async () => {
    const { fake, rt } = await setup();
    await fake.emit({ type: "agent_start" });
    expect(rt.session).toMatchObject({ agent: "streaming", turnToolCalls: 0 });
    rt.session.humanWaiting = true;
    await fake.emit({ timestamp: 0, turnIndex: 0, type: "turn_start" });
    expect(rt.session.humanWaiting).toBe(false);
    await fake.emit({
      args: {},
      toolCallId: "c1",
      toolName: "look",
      type: "tool_execution_start",
    });
    expect(rt.session).toMatchObject({ agent: "tool", tool: "look" });
    await fake.emit({
      isError: false,
      result: {},
      toolCallId: "c1",
      toolName: "look",
      type: "tool_execution_end",
    });
    expect(rt.session).toMatchObject({ agent: "streaming", tool: undefined });
    await fake.emit({ messages: [], type: "agent_end" });
    expect(rt.session.agent).toBe("idle");
  });
  test("logs assistant text as agent/message", async () => {
    const { fake, rt } = await setup();
    await fake.emit({
      message: {
        content: [{ text: "I am level 10.", type: "text" }],
        role: "assistant",
      },
      type: "message_end",
    });
    expect(rt.log.recent(1)[0]).toMatchObject({
      event: "agent/message",
      text: "I am level 10.",
    });
  });
});
