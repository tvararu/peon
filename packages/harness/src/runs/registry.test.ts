import { describe, expect, test } from "bun:test";
import { messageOf } from "@peon/core/lib/errors";
import type { RunEnd, RunEvent } from "#harness/contract/runs";
import type { JsonlSink } from "#harness/contract/services";
import { createGameLog } from "#harness/log/store";
import { Refusal } from "#harness/ops/refusal";
import { createRunRegistry, runLabel, runView } from "#harness/runs/registry";

function setup() {
  let now = 100;
  const clock = { now: () => now };
  const rows: unknown[] = [];
  const sink: JsonlSink = {
    close: async () => {},
    flush: async () => {},
    write: (row) => {
      rows.push(row);
    },
  };
  const log = createGameLog({ char: () => "Fgk", clock, file: undefined });
  const runs = createRunRegistry({ clock, log, sink });
  return {
    log,
    rows,
    runs,
    tick: (ms: number) => {
      now += ms;
    },
  };
}

function succeeded(summary: string): RunEnd<number> {
  return { status: "succeeded", summary, value: 1 };
}

function waitForAbort() {
  return ({ signal }: { signal: AbortSignal }) =>
    new Promise<RunEnd<number>>((resolve) => {
      signal.addEventListener("abort", () =>
        resolve({
          reason: messageOf(signal.reason),
          status: "cancelled",
          summary: "stopped",
          value: 0,
        }),
      );
    });
}

describe("createRunRegistry", () => {
  test("gives ids r1, r2 and records the end", async () => {
    const { rows, runs, tick } = setup();
    const first = runs.start({
      args: { to: "u4" },
      kind: "travel",
      launch: async () => succeeded("arrived"),
      toolCallId: "c1",
    });
    expect(first.id).toBe("r1");
    tick(50);
    await first.done;
    const second = runs.start({
      args: {},
      kind: "rest",
      launch: async () => succeeded("rested"),
      toolCallId: undefined,
    });
    await second.done;
    expect(second.id).toBe("r2");
    expect(runs.get("r1")).toMatchObject({
      endedAt: 150,
      startedAt: 100,
      status: "succeeded",
      summary: "arrived",
    });
    expect(rows).toEqual([
      {
        args: { to: "u4" },
        endedAt: 150,
        id: "r1",
        kind: "travel",
        reason: undefined,
        startedAt: 100,
        status: "succeeded",
        summary: "arrived",
      },
      {
        args: {},
        endedAt: 150,
        id: "r2",
        kind: "rest",
        reason: undefined,
        startedAt: 150,
        status: "succeeded",
        summary: "rested",
      },
    ]);
    expect(runs.list().map((run) => run.id)).toEqual(["r1", "r2"]);
  });

  test("refuses a second run while one is active", () => {
    const { runs } = setup();
    runs.start({
      args: {},
      kind: "engage",
      launch: waitForAbort(),
      toolCallId: "c1",
    });
    const second = () =>
      runs.start({
        args: {},
        kind: "travel",
        launch: waitForAbort(),
        toolCallId: "c2",
      });
    expect(second).toThrow(Refusal);
    try {
      second();
    } catch (error) {
      expect(error).toMatchObject({
        detail: "r1 (engage) is still running.",
        next: 'stop(run: "r1")',
        reason: "busy",
      });
    }
  });

  test("emits started, progress and ended", async () => {
    const { runs } = setup();
    const events: RunEvent[] = [];
    runs.subscribe((event) => events.push(event));
    const run = runs.start({
      args: {},
      kind: "engage",
      launch: async ({ progress }) => {
        progress("1 of 3 kills");
        return succeeded("3 kills");
      },
      toolCallId: "c1",
    });
    await run.done;
    expect(events.map((event) => [event.type, event.record.progress])).toEqual([
      ["started", undefined],
      ["progress", "1 of 3 kills"],
      ["ended", "1 of 3 kills"],
    ]);
  });

  test("cancel aborts with the cause code and records the status", async () => {
    const { runs } = setup();
    const human = runs.start({
      args: {},
      kind: "engage",
      launch: waitForAbort(),
      toolCallId: "c1",
    });
    expect(runs.cancel(human.id, "human")?.status).toBe("running");
    expect(await human.done).toMatchObject({
      reason: "human_stop",
      status: "cancelled",
    });
    const lost = runs.start({
      args: {},
      kind: "travel",
      launch: waitForAbort(),
      toolCallId: "c2",
    });
    expect(runs.cancelAll("lost").map((run) => run.id)).toEqual(["r2"]);
    await lost.done;
    expect(runs.get("r2")).toMatchObject({
      reason: "connection_lost",
      status: "interrupted",
    });
    expect(runs.cancel("r2", "tool")).toBeUndefined();
  });

  test("records failed and rejects done when the launch throws", async () => {
    const { runs } = setup();
    const run = runs.start({
      args: {},
      kind: "rest",
      launch: async () => {
        throw new Error("no_food");
      },
      toolCallId: "c1",
    });
    await expect(run.done).rejects.toThrow("no_food");
    expect(runs.get(run.id)).toMatchObject({
      reason: "no_food",
      status: "failed",
    });
    expect(runs.active()).toBeUndefined();
  });

  test("release marks a run as not awaited", () => {
    const { runs } = setup();
    const run = runs.start({
      args: {},
      kind: "engage",
      launch: waitForAbort(),
      toolCallId: "c1",
    });
    expect(runs.active()?.awaited).toBe(true);
    runs.release(run.id);
    expect(runs.get(run.id)?.awaited).toBe(false);
  });

  test("runLabel and runView describe a record", () => {
    const { runs } = setup();
    runs.start({
      args: { count: 3, target: "u9" },
      kind: "engage",
      launch: waitForAbort(),
      toolCallId: "c1",
    });
    const record = runs.get("r1");
    expect(record && runLabel(record)).toBe("engage 3 u9");
    expect(record && runView(record, 1100)).toEqual({
      elapsedMs: 1000,
      id: "r1",
      kind: "engage",
      label: "engage 3 u9",
      progress: undefined,
    });
  });
});
