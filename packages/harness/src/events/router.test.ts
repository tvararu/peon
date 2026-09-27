import { describe, expect, test } from "bun:test";
import type { TacticsEvent, WorldHandle } from "@tuicraft/core";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import type { RunEnd, RunRegistry } from "#harness/contract/runs";
import { routerSetup as setup } from "#test-support/router-fixture";

async function endRun(runs: RunRegistry, awaited: boolean): Promise<string> {
  let finish = () => {};
  const launch = () =>
    new Promise<RunEnd<number>>((resolve) => {
      finish = () =>
        resolve({ status: "succeeded", summary: "killed u9", value: 1 });
    });
  const run = runs.start({
    args: { target: "u9" },
    kind: "engage",
    launch,
    toolCallId: "call-1",
  });
  if (!awaited) runs.release(run.id);
  finish();
  await run.done;
  return run.id;
}

describe("createEventRouter", () => {
  test("attach subscribes all 21 hooks and detach removes them", () => {
    const { router } = setup();
    const handle = createMockHandle();
    const hooks = Object.keys(handle).filter((key) => /^on[A-Z]/.test(key));
    const live = new Set<string>();
    const spied: Record<string, unknown> = {};
    for (const name of hooks)
      spied[name] = () => {
        live.add(name);
        return () => live.delete(name);
      };
    const detach = router.attach({ ...handle, ...spied } as WorldHandle);
    expect(hooks).toHaveLength(21);
    expect([...live].sort()).toEqual([...hooks].sort());
    detach();
    expect(live.size).toBe(0);
  });

  test("an unawaited run end is a delivered wake with its run id", async () => {
    const { log, runs, sink } = setup();
    const id = await endRun(runs, false);
    const ended = log.since(0).find((row) => row.event === "run/ended");
    expect(ended).toMatchObject({ class: "wake", delivered: false, runId: id });
    expect(sink.wake).toHaveBeenCalledWith([ended]);
  });

  test("an awaited run end stays in the log", async () => {
    const { log, runs, sink } = setup();
    await endRun(runs, true);
    expect(log.since(0).map((row) => [row.event, row.class])).toEqual([
      ["run/started", "log"],
      ["run/ended", "log"],
    ]);
    expect(sink.wake).not.toHaveBeenCalled();
  });

  test("wake off turns a wake into a passive line", async () => {
    const { log, runs, sink } = setup({ wake: false });
    await endRun(runs, false);
    expect(log.since(0).find((row) => row.event === "run/ended")?.class).toBe(
      "passive",
    );
    expect(sink.passive).toHaveBeenCalled();
  });

  test("a throttled wake becomes passive and logs session/wake_throttled", async () => {
    const { log, runs, sink } = setup();
    for (const _ of [1, 2, 3, 4]) await endRun(runs, false);
    const ends = log.since(0).filter((row) => row.event === "run/ended");
    expect(ends.map((row) => row.class)).toEqual([
      "wake",
      "wake",
      "wake",
      "passive",
    ]);
    const throttled = log
      .since(0)
      .filter((row) => row.event === "session/wake_throttled");
    expect(throttled).toHaveLength(1);
    expect(sink.human).toHaveBeenCalledWith(throttled[0]);
  });

  test("sends Jev request, result and applied rows to jev.jsonl only", () => {
    const { jevRows, log, router } = setup();
    const handle = createMockHandle();
    router.attach(handle);
    handle.triggerTacticsEvent({
      candidates: [],
      framing: "none",
      instruction: "fight",
      observation: {},
      runId: "t1",
      sentAtMs: 0,
      type: "request",
    });
    handle.triggerTacticsEvent({
      actionId: "a1",
      ageMs: 5,
      runId: "t1",
      type: "applied",
    });
    expect(jevRows).toHaveLength(2);
    expect(jevRows[0]).toMatchObject({
      runId: "t1",
      ts: 1_000_000,
      type: "request",
    });
    expect(log.count()).toBe(0);
  });

  test("delivers wake rows that other modules append", () => {
    const { log, sink } = setup();
    const lost = log.append({
      class: "wake",
      data: {},
      domain: "session",
      event: "session/lost",
      text: "Connection lost. The human must run /connect.",
    });
    expect(sink.wake).toHaveBeenCalledWith([lost]);
    expect(sink.human).toHaveBeenCalledWith(lost);
  });

  test("rows an engage run summarises are consumed by its call", () => {
    const { log, router, runs } = setup();
    const handle = createMockHandle();
    router.attach(handle);
    const run = runs.start<number>({
      args: {},
      kind: "engage",
      launch: () => new Promise(() => {}),
      toolCallId: "call-7",
    });
    handle.triggerCycleEvent({
      at: 0,
      state: handle.getCycleState(),
      type: "started",
    });
    handle.triggerTacticsEvent({
      instruction: "fight",
      runId: "t1",
      targetGuid: "0x2a",
      type: "started",
    } as TacticsEvent);
    const combat = handle.getCombatState();
    handle.triggerCombatEvent({
      state: {
        ...combat,
        lastXp: { at: 1, kind: "kill", total: 90, victim: 0x2an },
      },
      type: "xp",
    });
    handle.triggerCombatEvent({
      state: {
        ...combat,
        lastXp: { at: 2, kind: "other", total: 30, victim: 0n },
      },
      type: "xp",
    });
    handle.triggerQuestEvent({
      questId: 8325,
      source: "packet",
      state: handle.getQuestState(),
      type: "completed",
    });
    const rows = log
      .since(0)
      .filter((row) => row.class === "passive")
      .map((row) => [row.event, row.runId, row.consumedBy]);
    expect(rows).toEqual([
      ["fight/start", run.id, "call-7"],
      ["combat/kill_credit", run.id, "call-7"],
      ["xp/gain", run.id, "call-7"],
      ["xp/gain", run.id, undefined],
      ["quest/completed", run.id, undefined],
    ]);
  });

  test("the same rows outside an engage run stay unconsumed", () => {
    const { log, router, runs } = setup();
    const handle = createMockHandle();
    router.attach(handle);
    runs.start<number>({
      args: {},
      kind: "travel",
      launch: () => new Promise(() => {}),
      toolCallId: "call-8",
    });
    handle.triggerCombatEvent({
      state: {
        ...handle.getCombatState(),
        lastXp: { at: 1, kind: "kill", total: 90, victim: 0x2an },
      },
      type: "xp",
    });
    expect(log.since(0).filter((row) => row.consumedBy !== undefined)).toEqual(
      [],
    );
  });

  test("delivers nothing without a sink", async () => {
    const { log, router, runs, sink } = setup();
    router.setSink(undefined);
    await endRun(runs, false);
    expect(log.since(0).some((row) => row.event === "run/ended")).toBe(true);
    expect(sink.wake).not.toHaveBeenCalled();
  });
});
