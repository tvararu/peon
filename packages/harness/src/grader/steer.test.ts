import { describe, expect, test } from "bun:test";
import type { Scenario } from "#harness/grader/scenarios";
import {
  describeAt,
  dueSteer,
  type EndMemory,
  type EndView,
  endAction,
  stuckAfterMs,
  stuckStopMs,
} from "#harness/grader/steer";
import type { ProgressJson, TriggerRow } from "#harness/grader/watch";

const steers: Scenario["steers"] = [
  {
    at: { kind: "trigger", trigger: "fight_start" },
    text: "Stop! Stop right now.",
  },
  {
    at: { kind: "elapsed", ms: 25_000 },
    text: "OK, carry on, but only use Smite from now on.",
  },
];

const trig = (trigger: TriggerRow["trigger"], ms: number): TriggerRow => ({
  ms,
  seq: 1,
  text: trigger,
  trigger,
});

const TASK = 100_000;
const memory = (overrides: Partial<EndMemory> = {}): EndMemory => ({
  nudgedAt: undefined,
  stopAt: undefined,
  stopReason: undefined,
  taskMs: TASK,
  ...overrides,
});

function progress(overrides: Partial<ProgressJson> = {}): ProgressJson {
  return {
    agent: "idle",
    at: 0,
    idleSinceMs: undefined,
    lastProgress: undefined,
    lastToolCallAt: undefined,
    ...overrides,
  };
}

function view(now: number, overrides: Partial<EndView> = {}): EndView {
  return {
    budgetMs: 600_000,
    lastAnswerAt: undefined,
    now,
    progress: progress(),
    statusAt: now,
    tier: 1,
    ...overrides,
  };
}

describe("dueSteer", () => {
  test("a trigger steer waits for a matching row after the cursor", () => {
    const cursor = { index: 0, since: 1000 };
    expect(
      dueSteer({
        cursor,
        now: 5000,
        steers,
        triggers: [trig("fight_start", 900)],
      }),
    ).toBeUndefined();
    expect(
      dueSteer({ cursor, now: 5000, steers, triggers: [trig("kill", 2000)] }),
    ).toBeUndefined();
    expect(
      dueSteer({
        cursor,
        now: 5000,
        steers,
        triggers: [trig("fight_start", 2000)],
      }),
    ).toBe(steers[0]);
  });

  test("an elapsed steer counts from the previous steer", () => {
    const cursor = { index: 1, since: 10_000 };
    expect(
      dueSteer({ cursor, now: 34_999, steers, triggers: [] }),
    ).toBeUndefined();
    expect(dueSteer({ cursor, now: 35_000, steers, triggers: [] })).toBe(
      steers[1],
    );
  });

  test("nothing is due after the last steer", () => {
    expect(
      dueSteer({
        cursor: { index: 2, since: 0 },
        now: 99_999,
        steers,
        triggers: [trig("fight_start", 5)],
      }),
    ).toBeUndefined();
  });

  test("describeAt names the trigger or the delay", () => {
    expect(steers.map((steer) => describeAt(steer.at))).toEqual([
      "fight_start",
      "elapsed:25000",
    ]);
  });
});

describe("stuck thresholds", () => {
  test("follow eval-suite step 11", () => {
    expect([0, 1, 7, 8].map(stuckAfterMs)).toEqual([
      90_000, 180_000, 180_000, 480_000,
    ]);
    expect([0, 1, 8].map(stuckStopMs)).toEqual([60_000, 120_000, 120_000]);
  });
});

describe("endAction", () => {
  test("waits while the agent works", () => {
    const busy = progress({
      agent: "tool",
      lastProgress: { at: TASK + 10_000, event: "nav/route_start" },
    });
    expect(
      endAction(view(TASK + 20_000, { progress: busy }), memory()),
    ).toEqual({ kind: "wait" });
  });

  test("ends as done after an answer and 30 s of quiet", () => {
    const answered = { lastAnswerAt: TASK + 5000 };
    expect(endAction(view(TASK + 34_999, answered), memory())).toEqual({
      kind: "wait",
    });
    expect(endAction(view(TASK + 35_000, answered), memory())).toEqual({
      end: "done",
      escape: false,
      kind: "end",
    });
  });

  test("is not done while the agent still streams", () => {
    const streaming = {
      lastAnswerAt: TASK + 5000,
      progress: progress({ agent: "streaming" }),
    };
    expect(endAction(view(TASK + 60_000, streaming), memory())).toEqual({
      kind: "wait",
    });
  });

  test("stops at the wall budget", () => {
    expect(endAction(view(TASK + 600_000), memory())).toEqual({
      kind: "stop",
      reason: "budget",
    });
  });

  test("nudges once when stuck, then stops", () => {
    const stuckAt = TASK + 180_000;
    expect(endAction(view(stuckAt - 1), memory())).toEqual({ kind: "wait" });
    expect(endAction(view(stuckAt), memory())).toEqual({ kind: "nudge" });
    const nudged = memory({ nudgedAt: stuckAt });
    expect(endAction(view(stuckAt + 119_999), nudged)).toEqual({
      kind: "wait",
    });
    expect(endAction(view(stuckAt + 120_000), nudged)).toEqual({
      kind: "stop",
      reason: "stuck",
    });
  });

  test("tier 0 nudges after 90 s", () => {
    expect(endAction(view(TASK + 90_000, { tier: 0 }), memory())).toEqual({
      kind: "nudge",
    });
  });

  test("after a stop, ends when the agent answered and is idle, else escapes after 60 s", () => {
    const stopped = memory({ stopAt: TASK + 600_000, stopReason: "budget" });
    const busy = progress({ agent: "tool" });
    expect(
      endAction(view(TASK + 610_000, { progress: busy }), stopped),
    ).toEqual({ kind: "wait" });
    expect(
      endAction(
        view(TASK + 610_000, { lastAnswerAt: TASK + 605_000 }),
        stopped,
      ),
    ).toEqual({ end: "budget", escape: false, kind: "end" });
    expect(
      endAction(view(TASK + 660_000, { progress: busy }), stopped),
    ).toEqual({ end: "budget", escape: true, kind: "end" });
  });

  test("aborts when status.json stops changing", () => {
    expect(
      endAction(view(TASK + 40_000, { statusAt: TASK + 9999 }), memory()),
    ).toEqual({ evidence: "status.json not updated for 30 s", kind: "abort" });
  });
});
