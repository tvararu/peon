import { describe, expect, test } from "bun:test";
import { scratchDir } from "@peon/core/test-support/scratch";
import {
  efficiency,
  readSessionUsage,
  sessionUsage,
} from "#harness/grader/efficiency";

const usage = (
  input: number,
  cacheRead: number,
  output: number,
  reasoning?: number,
) => ({
  cacheRead,
  cacheWrite: 0,
  input,
  output,
  reasoning,
  totalTokens: input + output,
});

const LINES = [
  {
    cwd: "/wt/tmp/evals/1/t0-self-state-1/workspace",
    id: "s1",
    timestamp: "2026-09-26T21:00:00.000Z",
    type: "session",
  },
  {
    id: "m1",
    message: {
      content: [{ text: "Quick status", type: "text" }],
      role: "user",
    },
    parentId: null,
    timestamp: "t",
    type: "message",
  },
  {
    id: "m2",
    message: {
      content: [
        { type: "thinking" },
        { arguments: {}, id: "c1", name: "look", type: "toolCall" },
        { arguments: {}, id: "c2", name: "journal", type: "toolCall" },
      ],
      role: "assistant",
      usage: usage(1200, 900, 80, 10),
    },
    parentId: "m1",
    timestamp: "t",
    type: "message",
  },
  {
    id: "m3",
    message: {
      content: [],
      isError: true,
      role: "toolResult",
      toolCallId: "c1",
      toolName: "look",
    },
    parentId: "m2",
    timestamp: "t",
    type: "message",
  },
  {
    id: "m4",
    message: {
      content: [{ text: "Level 10.", type: "text" }],
      role: "assistant",
      usage: usage(1500, 1100, 40),
    },
    parentId: "m3",
    timestamp: "t",
    type: "message",
  },
];

const JSONL = `${LINES.map((line) => JSON.stringify(line)).join("\n")}\n{"broken":\n`;

describe("sessionUsage", () => {
  test("counts turns, tool calls, tool errors and tokens", () => {
    expect(sessionUsage(JSONL)).toEqual({
      tokens: { cachedInput: 2000, input: 2700, output: 120, reasoning: 10 },
      toolCalls: 2,
      toolCallsByName: { journal: 1, look: 1 },
      toolErrors: 1,
      turns: 2,
    });
  });

  test("gives zeros for a missing session file", async () => {
    const dir = scratchDir("session");
    expect((await readSessionUsage(`${dir}/session.jsonl`)).turns).toBe(0);
  });
});

describe("efficiency", () => {
  test("fills the schema fields and budget ratios", () => {
    const result = efficiency({
      budget: { minutes: 3, tools: 10, turns: 4 },
      firstActionMs: 4200,
      usage: sessionUsage(JSONL),
      wallMs: 72_000,
    });
    expect(result).toEqual({
      budgetRatio: { toolCalls: 0.2, turns: 0.5, wallSec: 0.4 },
      timeToFirstActionSec: 4.2,
      tokens: { cachedInput: 2000, input: 2700, output: 120, reasoning: 10 },
      toolCalls: 2,
      toolCallsByName: { journal: 1, look: 1 },
      toolErrors: 1,
      turns: 2,
      wallSec: 72,
    });
  });

  test("keeps the exit time apart from the wall time to the answer", () => {
    const result = efficiency({
      budget: { minutes: 3, tools: 10, turns: 4 },
      exitMs: 56_000,
      firstActionMs: 1000,
      usage: sessionUsage(""),
      wallMs: 3100,
    });
    expect(result.wallSec).toBe(3.1);
    expect(result.exitSec).toBe(56);
    expect(result.budgetRatio?.wallSec).toBe(0.02);
  });

  test("leaves out the first-action time when no tool was called", () => {
    const result = efficiency({
      budget: { minutes: 3, tools: 10, turns: 4 },
      firstActionMs: undefined,
      usage: sessionUsage(""),
      wallMs: 1000,
    });
    expect(result.timeToFirstActionSec).toBeUndefined();
  });
});
