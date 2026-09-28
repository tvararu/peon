import { describe, expect, test } from "bun:test";
import { type EvalResult, validateResult } from "#harness/grader/result";

const valid: EvalResult = {
  accounts: ["FAC0123456789"],
  checks: [
    {
      expected: 10,
      id: "level",
      met: true,
      observed: 10,
      ref: "baseline.json",
      source: "truth",
    },
  ],
  efficiency: {
    budgetRatio: { toolCalls: 0.2, turns: 0.5, wallSec: 0.4 },
    tokens: { cachedInput: 900, input: 1200, output: 80, reasoning: 0 },
    toolCalls: 2,
    turns: 2,
    wallSec: 72,
  },
  end: "done",
  evidence: {
    finalSavedAt: "2026-09-26T21:10:00.000Z",
    frames: 9,
    runDir: "tmp/evals/1/t0-self-state-1",
  },
  friction: [
    {
      area: "tool",
      category: "repeated-call",
      quote: "look() twice",
      ref: "session.jsonl:12",
      severity: "minor",
    },
  ],
  interventions: [],
  replica: 1,
  round: 1,
  scenario: "t0-self-state",
  sha: "3af5aa3",
  tab: "eval-1-t0-self-state-1",
  verdict: "pass",
};

describe("validateResult", () => {
  test("accepts a complete result", () => {
    expect(validateResult(valid)).toEqual([]);
  });

  test("names a missing required field", () => {
    const { verdict: _verdict, ...rest } = valid;
    expect(validateResult(rest)).toEqual(["$: missing verdict"]);
  });

  test("rejects a value outside an enum", () => {
    expect(validateResult({ ...valid, verdict: "ok" })).toEqual([
      "$.verdict: expected one of pass|fail|blocked|aborted",
    ]);
  });

  test("checks array items against their pattern", () => {
    expect(validateResult({ ...valid, accounts: ["XIARA"] })).toEqual([
      "$.accounts[0]: does not match ^FAC[0-9A-F]{10}$",
    ]);
  });

  test("checks integers and minimums", () => {
    expect(validateResult({ ...valid, replica: 0 })).toEqual([
      "$.replica: below minimum 1",
    ]);
    expect(validateResult({ ...valid, replica: 1.5 })).toEqual([
      "$.replica: expected integer",
    ]);
  });

  test("checks nested required fields and maxLength", () => {
    const friction = [
      {
        area: "tool",
        category: "other",
        quote: "x".repeat(601),
        severity: "minor",
      },
    ];
    expect(validateResult({ ...valid, friction })).toEqual([
      "$.friction[0]: missing ref",
      "$.friction[0].quote: longer than 600",
    ]);
  });

  test("checks additionalProperties values", () => {
    const efficiency = { ...valid.efficiency, toolCallsByName: { look: 1.5 } };
    expect(validateResult({ ...valid, efficiency })).toEqual([
      "$.efficiency.toolCallsByName.look: expected integer",
    ]);
  });

  test("accepts the abort causes added for the realm service", () => {
    const aborted = {
      ...valid,
      abort: { cause: "stale_truth", evidence: "savedAt older than exit" },
      end: "abort",
      verdict: "aborted",
    };
    expect(validateResult(aborted)).toEqual([]);
  });

  test("rejects a check source that was removed", () => {
    const checks = [{ ...valid.checks[0], source: "pinfo" }];
    expect(validateResult({ ...valid, checks })).toEqual([
      "$.checks[0].source: expected one of truth|verifier|witness|game_log|session|frame|console",
    ]);
  });

  test("rejects a non-object", () => {
    expect(validateResult(null)).toEqual(["$: expected object"]);
  });
});
