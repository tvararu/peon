import { describe, expect, test } from "bun:test";
import type { RunEvent, RunRecord } from "#harness/contract/runs";
import { RUN_PROGRESS_MS, runDrafts, unitIds } from "#harness/events/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

function record(over: Partial<RunRecord> = {}): RunRecord {
  return {
    args: { target: "u9" },
    awaited: true,
    endedAt: undefined,
    id: "r4",
    kind: "engage",
    progress: undefined,
    reason: undefined,
    startedAt: 1000,
    status: "running",
    summary: undefined,
    toolCallId: "call-1",
    ...over,
  };
}

function event(
  type: RunEvent["type"],
  over: Partial<RunRecord> = {},
): RunEvent {
  return { record: record(over), type };
}

describe("unitIds", () => {
  test("gives the hex guid and the ref, or nothing", () => {
    expect(unitIds(0x2an, testRuleInput())).toEqual({ guid: "2a", ref: "u42" });
    expect(unitIds(undefined, testRuleInput())).toEqual({});
  });
});

describe("runDrafts", () => {
  test("logs a run start", () => {
    expect(runDrafts(event("started"), testRuleInput())).toEqual([
      {
        class: "log",
        data: {
          args: { target: "u9" },
          id: "r4",
          kind: "engage",
          progress: undefined,
          reason: undefined,
          status: "running",
          summary: undefined,
        },
        domain: "run",
        event: "run/started",
        runId: "r4",
        text: "r4 started: engage u9",
        tool: "call-1",
      },
    ]);
  });

  test("logs progress at most once per 5 s per run", () => {
    const rc = testRuleInput({ now: 10_000 });
    const progress = event("progress", { progress: "1 of 3 kills" });
    expect(runDrafts(progress, rc).map((draft) => draft.text)).toEqual([
      "r4 1 of 3 kills",
    ]);
    expect(
      runDrafts(progress, { ...rc, now: 10_000 + RUN_PROGRESS_MS - 1 }),
    ).toEqual([]);
    expect(
      runDrafts(progress, { ...rc, now: 10_000 + RUN_PROGRESS_MS }),
    ).toHaveLength(1);
  });

  test("an awaited end is log, an unawaited end is a wake", () => {
    const end = {
      endedAt: 5000,
      status: "succeeded" as const,
      summary: "3 kills, 390 xp",
    };
    const [awaited] = runDrafts(event("ended", end), testRuleInput());
    const [alone] = runDrafts(
      event("ended", { ...end, awaited: false }),
      testRuleInput(),
    );
    expect(awaited).toMatchObject({
      class: "log",
      event: "run/ended",
      text: "r4 engage u9 succeeded: 3 kills, 390 xp",
    });
    expect(alone).toMatchObject({ class: "wake", event: "run/ended" });
  });

  test("a cancelled or interrupted run is run/cancelled and never wakes", () => {
    const [cancelled] = runDrafts(
      event("ended", {
        awaited: false,
        reason: "human_stop",
        status: "cancelled",
      }),
      testRuleInput(),
    );
    const [lost] = runDrafts(
      event("ended", { reason: "connection_lost", status: "interrupted" }),
      testRuleInput(),
    );
    expect(cancelled).toMatchObject({
      class: "log",
      event: "run/cancelled",
      text: "r4 engage u9 cancelled: human_stop",
    });
    expect(lost).toMatchObject({ class: "log", event: "run/cancelled" });
  });
});
