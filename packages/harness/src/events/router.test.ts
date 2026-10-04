import { describe, expect, jest, test } from "bun:test";
import { type AreaEvent, ObjectType, type UnitEntity } from "@peon/core";
import { type AreaRuleSet, areaRuleSet } from "#harness/areas/rules";
import type { RunEnd, RunRegistry } from "#harness/contract/runs";
import { createWakeGuard } from "#harness/events/guard";
import { createEventRouter } from "#harness/events/router";
import { XP_SOURCE_WAIT_MS } from "#harness/events/rules-xp";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import type { Game } from "#harness/loops/game";
import type { TacticsEvent } from "#harness/loops/tactics";
import { createRunRegistry } from "#harness/runs/registry";
import { createMockGame } from "#test-support/mock-game";
import { routerSetup as setup, testFlags } from "#test-support/router-fixture";

function ruledRouter(rules: AreaRuleSet) {
  const clock = { now: () => 1_000_000 };
  const log = createGameLog({ char: () => "Fgk", clock, file: undefined });
  const sink = createJsonlSink({ file: undefined });
  const router = createEventRouter({
    areaRules: rules,
    attacks: {
      attach: () => () => {},
      lastAttacker: () => undefined,
      lastHitAt: () => undefined,
    },
    context: () => ({
      now: clock.now(),
      refOf: (guid) => `u${guid}`,
      runActive: false,
      selfGuid: 1n,
      selfName: "Fgk",
      wake: true,
    }),
    flags: testFlags,
    guard: createWakeGuard(clock),
    jevLog: sink,
    log,
    runs: createRunRegistry({ clock, log, sink }),
  });
  return { log, router };
}

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
  test("attach subscribes every hook and detach removes them", () => {
    const { router } = setup();
    const handle = createMockGame();
    const hooks = Object.keys(handle).filter(
      (key) => /^on[A-Z]/.test(key) && key !== "onMovementStop",
    );
    const live = new Set<string>();
    const spied: Record<string, unknown> = {};
    for (const name of hooks)
      spied[name] = () => {
        live.add(name);
        return () => live.delete(name);
      };
    const detach = router.attach({ ...handle, ...spied } as Game);
    expect(hooks).toContain("onAreaEvent");
    expect([...live].sort()).toEqual([...hooks].sort());
    detach();
    expect(live.size).toBe(0);
  });

  test("an area event with no rule writes one quiet fallback row", () => {
    const { log, router, sink } = setup();
    const handle = createMockGame();
    router.attach(handle);
    const { area, event }: AreaEvent = {
      area: "beta",
      event: { speed: 2, type: "synced" },
    } as never;
    handle.triggerAreaEvent(area, event);
    expect<unknown[]>(
      log.since(0).map(({ class: c, data, event: e }) => [c, e, data]),
    ).toEqual([
      ["log", "beta/synced", { fallback: true, speed: 2, type: "synced" }],
    ]);
    expect(sink.passive).not.toHaveBeenCalled();
    expect(sink.wake).not.toHaveBeenCalled();
  });

  test("attach writes the rows of the area attach rules", () => {
    const rules = areaRuleSet({
      alpha: {
        area: "alpha",
        rules: () => ({
          attach: (state: { speed: number }) => [
            {
              class: "log" as const,
              data: { speed: state.speed },
              name: "synced",
              progress: true as const,
              text: "Server time synced.",
            },
          ],
        }),
      },
    });
    const { log, router } = ruledRouter(rules);
    const handle = Object.assign(createMockGame(), {
      alpha: { state: () => ({ speed: 3 }) },
    });
    router.attach(handle);
    expect<unknown[]>(
      log.since(0).map((row) => [row.event, row.data, row.progress]),
    ).toEqual([["alpha/synced", { speed: 3 }, true]]);
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

  test("logs every tactics event to jev.jsonl, stopped without its state", () => {
    const { jevRows, log, router } = setup();
    const handle = createMockGame();
    router.attach(handle);
    handle.triggerTacticsEvent({
      framing: "none",
      instruction: "fight",
      runId: "t1",
      targetGuid: "0x1",
      type: "started",
    });
    handle.triggerTacticsEvent({
      call: 1,
      candidates: [],
      framing: "none",
      instruction: "fight",
      observation: {},
      runId: "t1",
      sentAtMs: 0,
      type: "request",
    });
    handle.triggerTacticsEvent({
      call: 1,
      error: "jev_timeout",
      runId: "t1",
      type: "transport",
    });
    handle.triggerTacticsEvent({
      reason: "failed",
      runId: "t1",
      state: {
        instruction: "fight",
        lastDecision: undefined,
        lastDiscardReason: undefined,
        lastOutcome: undefined,
        lastRequest: undefined,
        lastResult: undefined,
        runId: "t1",
        status: "idle",
        targetGuid: 1n,
        timeouts: { consecutive: 0, limit: 3, total: 0 },
      },
      type: "stopped",
    });
    expect(jevRows.map((row) => (row as { type: string }).type)).toEqual([
      "started",
      "request",
      "transport",
      "stopped",
    ]);
    expect(jevRows[2]).toMatchObject({ call: 1, ts: 1_000_000 });
    expect(jevRows[3]).toEqual({
      loop: "combat",
      reason: "failed",
      runId: "t1",
      ts: 1_000_000,
      type: "stopped",
    });
    expect(log.since(0).map((row) => row.event)).toEqual([
      "fight/start",
      "fight/end",
    ]);
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
    jest.useFakeTimers();
    const { log, router, runs } = setup();
    const handle = createMockGame();
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
    jest.advanceTimersByTime(XP_SOURCE_WAIT_MS);
    jest.useRealTimers();
    const rows = log
      .since(0)
      .filter((row) => row.class === "passive")
      .map((row) => [row.event, row.runId, row.consumedBy]);
    expect(rows).toEqual([
      ["fight/start", run.id, "call-7"],
      ["combat/kill_credit", run.id, "call-7"],
      ["xp/gain", run.id, "call-7"],
      ["quest/completed", run.id, undefined],
      ["xp/gain", run.id, undefined],
    ]);
  });

  test("a stopped engage gives its rows back, since its result has no tally", async () => {
    const { log, router, runs } = setup();
    const handle = createMockGame();
    router.attach(handle);
    const run = runs.start<number>({
      args: {},
      kind: "engage",
      launch: ({ signal }) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () =>
            resolve({ status: "failed", summary: "FAILED stopped", value: 0 }),
          );
        }),
      toolCallId: "call-9",
    });
    handle.triggerCombatEvent({
      state: {
        ...handle.getCombatState(),
        lastXp: { at: 1, kind: "kill", total: 90, victim: 0x2an },
      },
      type: "xp",
    });
    const consumed = () =>
      log
        .since(0)
        .filter((row) => row.event === "xp/gain")
        .map((row) => row.consumedBy);
    expect(consumed()).toEqual(["call-9"]);
    runs.cancel(run.id, "human");
    await run.done;
    expect(consumed()).toEqual([undefined]);
  });

  test("the same rows outside an engage run stay unconsumed", () => {
    const { log, router, runs } = setup();
    const handle = createMockGame();
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

  test("a halted target that dies with no credit wakes the agent", () => {
    const { log, router, sink } = setup();
    const handle = createMockGame();
    router.attach(handle);
    handle.triggerCombatEvent({
      attacker: 0x11n,
      state: handle.getCombatState(),
      type: "attacked",
    });
    const entity: UnitEntity = {
      class_: 1,
      displayId: 0,
      entry: 15_366,
      factionTemplate: 14,
      gender: 0,
      guid: 0x11n,
      health: 0,
      level: 7,
      maxHealth: 137,
      maxPower: [],
      name: "Springpaw Stalker",
      npcFlags: 0,
      objectType: ObjectType.UNIT,
      position: undefined,
      power: [],
      race: 0,
      rawFields: new Map(),
      scale: 1,
      target: 0n,
      unitFlags: 0,
    };
    handle.triggerEntityEvent({ changed: ["health"], entity, type: "update" });
    const died = log.since(0).find((row) => row.event === "combat/target_died");
    expect(died).toMatchObject({
      class: "wake",
      text: "Springpaw Stalker u17 died (no credit to you).",
    });
    expect(sink.wake).toHaveBeenCalledWith([died]);
  });

  test("delivers nothing without a sink", async () => {
    const { log, router, runs, sink } = setup();
    router.setSink(undefined);
    await endRun(runs, false);
    expect(log.since(0).some((row) => row.event === "run/ended")).toBe(true);
    expect(sink.wake).not.toHaveBeenCalled();
  });
});
