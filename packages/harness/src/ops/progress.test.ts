import { describe, expect, test } from "bun:test";
import type { ProgressTracker } from "#harness/contract/services";
import { createGameLog } from "#harness/log/store";
import {
  createProgressTracker,
  NO_PROGRESS_AT,
  STUCK_LOG_AT,
} from "#harness/ops/progress";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { ORIGIN, selfPose, setWorld } from "#test-support/world-fixtures";

type Action = Parameters<ProgressTracker["afterAction"]>[0];

function tracker() {
  const now = { t: 0 };
  const clock = { now: () => now.t };
  const log = createGameLog({
    char: () => "Fgklibhlflc",
    clock,
    file: undefined,
  });
  return { log, now, progress: createProgressTracker({ clock, log }) };
}

function action(over: Partial<Action> = {}): Action {
  return {
    digest: "d",
    kind: "run",
    reason: "no_ground",
    status: "REFUSED",
    tool: "travel",
    untried: ['travel(to: "unstick")'],
    ...over,
  };
}

describe("createProgressTracker", () => {
  test("reports no progress after NO_PROGRESS_AT unchanged actions", () => {
    const { now, progress } = tracker();
    for (let i = 0; i < NO_PROGRESS_AT; i++) progress.afterAction(action());
    expect(progress.noProgress()).toBeUndefined();
    now.t = 180_000;
    progress.afterAction(action());
    expect(progress.count()).toBe(NO_PROGRESS_AT);
    expect(progress.noProgress()).toEqual({
      actions: 3,
      lastRefusal: "travel no_ground x4",
      sinceMs: 180_000,
      untried: ['travel(to: "unstick")'],
    });
  });

  test("a changed digest or reason resets the count", () => {
    const { progress } = tracker();
    for (let i = 0; i < 4; i++) progress.afterAction(action());
    progress.afterAction(action({ digest: "e" }));
    expect(progress.count()).toBe(0);
    progress.afterAction(action({ digest: "e", reason: "start_off_mesh" }));
    expect(progress.count()).toBe(0);
  });

  test("a read tool neither adds nor resets, whatever its name", () => {
    const { progress } = tracker();
    progress.afterAction(action());
    progress.afterAction(action());
    for (const tool of ["look", "journal", "social"] as const)
      progress.afterAction(
        action({
          digest: "x",
          kind: "read",
          reason: undefined,
          status: "DONE",
          tool,
        }),
      );
    expect(progress.count()).toBe(1);
    progress.afterAction(action({ kind: "control", tool: "stop" }));
    expect(progress.count()).toBe(2);
  });

  test("logs agent/stuck once at STUCK_LOG_AT", () => {
    const { log, progress } = tracker();
    for (let i = 0; i <= STUCK_LOG_AT + 1; i++) progress.afterAction(action());
    const stuck = log
      .recent(50)
      .filter((entry) => entry.event === "agent/stuck");
    expect(stuck).toHaveLength(1);
    expect(stuck[0]?.class).toBe("log");
  });

  test("a progress event in the log resets the count and sets lastProgress", () => {
    const { log, now, progress } = tracker();
    for (let i = 0; i < 4; i++) progress.afterAction(action());
    now.t = 500;
    log.append({
      class: "passive",
      data: {},
      domain: "combat",
      event: "combat/kill_credit",
      text: "kill credit Springpaw Stalker",
    });
    expect(progress.count()).toBe(0);
    expect(progress.noProgress()).toBeUndefined();
    expect(progress.lastProgress()).toEqual({
      at: 500,
      event: "combat/kill_credit",
    });
  });

  test("a row marked progress resets the count, whatever its event", () => {
    const { log, now, progress } = tracker();
    for (let i = 0; i < 4; i++) progress.afterAction(action());
    now.t = 700;
    log.append({
      class: "log",
      data: {},
      domain: "chat",
      event: "chat/in",
      progress: true,
      text: "Mail sent.",
    });
    log.append({
      class: "log",
      data: {},
      domain: "chat",
      event: "chat/in",
      text: "Mail listed.",
    });
    expect(progress.count()).toBe(0);
    expect(progress.lastProgress()).toEqual({ at: 700, event: "chat/in" });
  });

  test("run rows change the digest", async () => {
    const { log, progress } = tracker();
    const { handle } = await createTestRuntime();
    const before = progress.digest(handle);
    log.append({
      class: "log",
      data: {},
      domain: "run",
      event: "run/started",
      text: "run started",
    });
    expect(progress.digest(handle)).not.toBe(before);
    expect(progress.digest(handle)).toEndWith("|running");
  });

  test("the digest keeps a 2 yd pose bucket", async () => {
    const { progress } = tracker();
    const { handle } = await createTestRuntime();
    setWorld(handle, { pose: selfPose(0, { x: 8736 }) });
    const a = progress.digest(handle);
    setWorld(handle, { pose: selfPose(0, { x: 8737 }) });
    expect(progress.digest(handle)).toBe(a);
    setWorld(handle, { pose: selfPose(0, { x: 8739 }) });
    expect(progress.digest(handle)).not.toBe(a);
  });

  test("attach counts a move over 5 yd as progress", async () => {
    const { now, progress } = tracker();
    const { handle } = await createTestRuntime();
    setWorld(handle, { pose: selfPose(0) });
    progress.attach(handle);
    const moved = (dx: number) => ({
      ...handle.getControlState(),
      pose: selfPose(0, { x: ORIGIN.x + dx }),
    });
    handle.triggerControlEvent({ state: moved(4), type: "movement_stopped" });
    expect(progress.lastProgress()).toBeUndefined();
    now.t = 900;
    handle.triggerControlEvent({ state: moved(6), type: "movement_stopped" });
    expect(progress.lastProgress()).toEqual({
      at: 900,
      event: "control/move_stop",
    });
  });
});
