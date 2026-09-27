import { describe, expect, test } from "bun:test";
import type {
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { installTools } from "#harness/tools/install";
import { GAME_TOOLS } from "#harness/tools/registry";
import { createTestRuntime } from "#test-support/runtime-fixture";

type Handler = (event: unknown) => unknown;

function fakePi() {
  const tools: ToolDefinition[] = [];
  const handlers = new Map<string, Handler[]>();
  const api = {
    on(name: string, handler: Handler) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    registerTool(tool: ToolDefinition) {
      tools.push(tool);
    },
  };
  const emit = (name: string, event: unknown) =>
    (handlers.get(name) ?? []).map((handler) => handler(event));
  return { emit, pi: api as unknown as ExtensionAPI, tools };
}

function ended(toolName: string, isError: boolean, text: string) {
  return {
    isError,
    result: { content: [{ text, type: "text" }], details: {} },
    toolCallId: "c1",
    toolName,
    type: "tool_execution_end",
  };
}

function toolMessage(toolName: string) {
  const message = {
    content: [
      { text: `Validation failed for tool "${toolName}"`, type: "text" },
    ],
    isError: true,
    role: "toolResult",
    timestamp: 0,
    toolCallId: "c1",
    toolName,
  };
  return { message, type: "message_end" };
}

const miss = (toolName: string) =>
  ended(
    toolName,
    true,
    `Validation failed for tool "${toolName}":\n  - to: must be string`,
  );

describe("installTools", () => {
  test("registers every listed tool in order with its renderers; look and journal run in parallel", async () => {
    const { rt } = await createTestRuntime();
    const { pi, tools } = fakePi();
    installTools(pi, rt);
    expect(tools.map((tool) => tool.name)).toEqual(
      GAME_TOOLS.map((tool) => tool.name),
    );
    GAME_TOOLS.forEach((listed, index) => {
      expect<unknown>(tools[index]?.renderCall).toBe(
        listed.renderers.renderCall,
      );
      expect<unknown>(tools[index]?.renderResult).toBe(
        listed.renderers.renderResult,
      );
    });
    const parallel = tools
      .filter((tool) => tool.executionMode === "parallel")
      .map((tool) => tool.name);
    expect(parallel).toEqual(["look", "journal"]);
  });

  test("appends the minimal valid call from the second miss in a row", async () => {
    const { rt } = await createTestRuntime();
    const { emit, pi } = fakePi();
    installTools(pi, rt);
    emit("tool_execution_end", miss("travel"));
    expect(emit("message_end", toolMessage("travel"))).toEqual([undefined]);
    emit("tool_execution_end", miss("travel"));
    const [hinted] = emit("message_end", toolMessage("travel"));
    expect(hinted).toMatchObject({
      message: {
        content: [
          { type: "text" },
          { text: 'Minimal valid call: travel(to: "explore")', type: "text" },
        ],
        role: "toolResult",
      },
    });
    expect(
      rt.log
        .recent(20)
        .filter((entry) => entry.event === "tool/validation_error"),
    ).toHaveLength(2);
  });

  test("a good result resets the count", async () => {
    const { rt } = await createTestRuntime();
    const { emit, pi } = fakePi();
    installTools(pi, rt);
    emit("tool_execution_end", miss("journal"));
    emit("tool_execution_end", ended("journal", false, "DONE 2 quests."));
    emit("tool_execution_end", miss("journal"));
    expect(emit("message_end", toolMessage("journal"))).toEqual([undefined]);
  });

  test("leaves other tools and assistant messages alone", async () => {
    const { rt } = await createTestRuntime();
    const { emit, pi } = fakePi();
    installTools(pi, rt);
    emit("tool_execution_end", miss("bash"));
    emit("tool_execution_end", miss("bash"));
    expect(emit("message_end", toolMessage("bash"))).toEqual([undefined]);
    expect(
      emit("message_end", {
        message: { content: [], role: "assistant" },
        type: "message_end",
      }),
    ).toEqual([undefined]);
  });
});
