import { describe, expect, jest, test } from "bun:test";
import type { RunEnd } from "#harness/contract/runs";
import type { YieldGate } from "#harness/contract/services";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createRunRegistry } from "#harness/runs/registry";
import { awaitRun } from "#harness/runs/wait";
import { createTestRuntime } from "#test-support/runtime-fixture";

function gate(): YieldGate {
  let fire = () => {};
  return {
    trigger: () => fire(),
    wait: () =>
      new Promise<"human">((resolve) => {
        fire = () => resolve("human");
      }),
  };
}

async function setup() {
  const clock = { now: () => 0 };
  const log = createGameLog({ char: () => "Fgk", clock, file: undefined });
  const runs = createRunRegistry({
    clock,
    log,
    sink: createJsonlSink({ file: undefined }),
  });
  const yields = gate();
  const { rt } = await createTestRuntime({ parts: { runs, yields } });
  return { rt, runs, yields };
}

const never = () => new Promise<RunEnd<number>>(() => {});

describe("awaitRun", () => {
  test("returns the run end when the run ends first", async () => {
    const { rt, runs } = await setup();
    const run = runs.start({
      args: {},
      kind: "rest",
      launch: async () => ({
        status: "succeeded",
        summary: "rested",
        value: 90,
      }),
      toolCallId: "c1",
    });
    expect(await awaitRun({ rt, run })).toEqual({
      end: { status: "succeeded", summary: "rested", value: 90 },
      kind: "ended",
    });
    expect(runs.get(run.id)?.awaited).toBe(true);
  });

  test("yields to the human and releases the run", async () => {
    const { rt, runs, yields } = await setup();
    const run = runs.start({
      args: {},
      kind: "engage",
      launch: never,
      toolCallId: "c1",
    });
    const waiting = awaitRun({ rt, run });
    yields.trigger();
    expect(await waiting).toEqual({ kind: "yielded", why: "human" });
    expect(runs.get(run.id)?.awaited).toBe(false);
  });

  test("yields after yieldAfterMs", async () => {
    const { rt, runs } = await setup();
    const run = runs.start({
      args: {},
      kind: "engage",
      launch: never,
      toolCallId: "c1",
    });
    jest.useFakeTimers();
    try {
      const waiting = awaitRun({ rt, run, yieldAfterMs: 1000 });
      jest.advanceTimersByTime(1000);
      expect(await waiting).toEqual({ kind: "yielded", why: "timeout" });
      expect(runs.get(run.id)?.awaited).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
