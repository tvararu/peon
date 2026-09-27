import { describe, expect, jest, test } from "bun:test";
import {
  type ControlPose,
  JevUnavailableError,
  type NavigationState,
  nextStepFor,
  type TacticsEvent,
} from "@tuicraft/core";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import {
  awaitCycle,
  awaitGoto,
  awaitQuestCycle,
  awaitTactics,
  jevCode,
  rawRefusal,
} from "#harness/runs/adapters";

const target = { kind: "point" as const, x: 10, y: 0 };
const idle: NavigationState = {
  active: false,
  blockedReason: undefined,
  destination: undefined,
  owner: "none",
  refusal: undefined,
  remaining: undefined,
};

function pose(x: number): ControlPose {
  return {
    mapId: 530,
    orientation: 0,
    source: "server",
    updatedAt: 0,
    x,
    y: 0,
    z: 0,
  };
}

function movingHandle() {
  const handle = createMockHandle();
  const base = handle.getControlState();
  let nav: NavigationState = idle;
  let at = pose(0);
  handle.getNavigationState = () => nav;
  handle.getControlState = () => ({ ...base, pose: at });
  handle.goTo = jest.fn(() => {
    nav = { ...idle, active: true, owner: "none" };
  });
  const stop = (next: NavigationState, x: number) => {
    nav = next;
    at = pose(x);
    handle.triggerControlEvent({
      state: handle.getControlState(),
      type: "movement_stopped",
    });
  };
  const set = (next: NavigationState) => {
    nav = next;
  };
  handle.halt = jest.fn(() => {
    stop({ ...idle, blockedReason: "halt" }, 2);
  });
  return { handle, set, stop };
}

describe("rawRefusal", () => {
  test("strips a navigation category and keeps other text", () => {
    expect(
      rawRefusal("unreachable: pathfind_find_height failed (UNKNOWN_HEIGHT)"),
    ).toBe("pathfind_find_height failed (UNKNOWN_HEIGHT)");
    expect(rawRefusal("World socket is not connected")).toBe(
      "World socket is not connected",
    );
    expect(rawRefusal("no_pose: x")).toBe("no_pose: x");
  });
});

describe("awaitGoto", () => {
  test("returns refused with floors when goTo throws", async () => {
    const handle = createMockHandle();
    const raw = "ambiguous ground column at destination";
    handle.goTo = jest.fn(() => {
      throw new Error(`pick_destination: ${raw}`);
    });
    handle.getNavigationState = () => ({
      ...idle,
      floors: [72.5, 80.1],
      refusal: "pick_destination",
    });
    const end = await awaitGoto(handle, {
      signal: new AbortController().signal,
      target,
    });
    expect(end).toEqual({
      floors: [72.5, 80.1],
      nextStep: nextStepFor(raw) ?? undefined,
      pose: undefined,
      refusal: raw,
      status: "refused",
      traveledYd: 0,
    });
  });

  test("returns arrived on movement_stopped with no blocked reason", async () => {
    const { handle, stop } = movingHandle();
    const waiting = awaitGoto(handle, {
      signal: new AbortController().signal,
      target,
    });
    stop(idle, 10);
    expect(await waiting).toMatchObject({
      refusal: undefined,
      status: "arrived",
      traveledYd: 10,
    });
  });

  test("returns refused with the raw reason when the route ends blocked", async () => {
    const { handle, stop } = movingHandle();
    const waiting = awaitGoto(handle, {
      signal: new AbortController().signal,
      target,
    });
    stop(
      { ...idle, blockedReason: "obstructed", refusal: "pick_destination" },
      4,
    );
    expect(await waiting).toMatchObject({
      nextStep: nextStepFor("obstructed") ?? undefined,
      refusal: "obstructed",
      status: "refused",
      traveledYd: 4,
    });
  });

  test("waits while a replan is pending, then polls the end", async () => {
    const { handle, set, stop } = movingHandle();
    const replan = {
      elapsedMs: 0,
      interruptions: [],
      limits: { displacement: 0, elapsedMs: 0, plans: 0, traveled: 0 },
      pending: true,
      plans: 1,
      traveled: 3,
    };
    jest.useFakeTimers();
    try {
      let ended = false;
      const waiting = awaitGoto(handle, {
        pollMs: 500,
        signal: new AbortController().signal,
        target,
      }).then((end) => {
        ended = true;
        return end;
      });
      stop({ ...idle, blockedReason: "server_correction", replan }, 3);
      await Promise.resolve();
      expect(ended).toBe(false);
      set(idle);
      jest.advanceTimersByTime(500);
      expect((await waiting).status).toBe("arrived");
    } finally {
      jest.useRealTimers();
    }
  });

  test("halts and returns stopped on abort", async () => {
    const { handle } = movingHandle();
    const controller = new AbortController();
    const waiting = awaitGoto(handle, { signal: controller.signal, target });
    controller.abort(new Error("esc"));
    expect((await waiting).status).toBe("stopped");
    expect(handle.halt).toHaveBeenCalled();
  });
});

function started(runId: string, guid: bigint): TacticsEvent {
  return {
    framing: "none",
    instruction: "fight",
    runId,
    targetGuid: `0x${guid.toString(16)}`,
    type: "started",
  };
}

describe("awaitTactics", () => {
  test("ends on the outcome of its own run", async () => {
    const handle = createMockHandle();
    handle.startTactics = jest.fn(() => new Promise<void>(() => {}));
    const waiting = awaitTactics(handle, {
      guid: 0x2an,
      instruction: "fight",
      signal: new AbortController().signal,
    });
    handle.triggerTacticsEvent(started("other", 0x3bn));
    handle.triggerTacticsEvent({
      reason: "server_kill_credit",
      runId: "other",
      status: "completed",
      type: "outcome",
    });
    handle.triggerTacticsEvent(started("t1", 0x2an));
    handle.triggerTacticsEvent({
      reason: "server_kill_credit",
      runId: "t1",
      status: "completed",
      type: "outcome",
    });
    expect(await waiting).toEqual({
      error: undefined,
      outcome: {
        observation: undefined,
        reason: "server_kill_credit",
        status: "completed",
      },
    });
  });

  test("takes the last outcome when stopped comes without one", async () => {
    const handle = createMockHandle();
    handle.startTactics = jest.fn(() => new Promise<void>(() => {}));
    const waiting = awaitTactics(handle, {
      guid: 0x2an,
      instruction: "fight",
      signal: new AbortController().signal,
    });
    handle.triggerTacticsEvent(started("t1", 0x2an));
    const state = {
      ...handle.getTacticsState(),
      lastOutcome: { reason: "target_lost", status: "blocked" as const },
    };
    handle.triggerTacticsEvent({
      reason: "halt",
      runId: "t1",
      state,
      type: "stopped",
    });
    expect((await waiting).outcome).toEqual({
      reason: "target_lost",
      status: "blocked",
    });
  });

  test("catches a synchronous throw", async () => {
    const handle = createMockHandle();
    handle.startTactics = jest.fn(() => {
      throw new Error("self_not_alive");
    });
    const end = await awaitTactics(handle, {
      guid: 1n,
      instruction: "fight",
      signal: new AbortController().signal,
    });
    expect(end).toEqual({ error: "self_not_alive", outcome: undefined });
  });

  test("catches a rejected start and maps it to jev_unavailable", async () => {
    const handle = createMockHandle();
    handle.startTactics = jest.fn(async () => {
      throw new JevUnavailableError("missing_jev_key");
    });
    const end = await awaitTactics(handle, {
      guid: 1n,
      instruction: "fight",
      signal: new AbortController().signal,
    });
    expect(end.error).toBe("jev_unavailable: missing_jev_key");
    expect(jevCode(end)).toBe("jev_unavailable");
  });

  test("maps a Jev failure that ends the fight to jev_unavailable", async () => {
    const handle = createMockHandle();
    handle.startTactics = jest.fn(async () => {
      handle.triggerTacticsEvent(started("t1", 1n));
      handle.triggerTacticsEvent({
        reason: "jev_unavailable: HTTP 503 server",
        runId: "t1",
        status: "failed",
        type: "outcome",
      });
      await Bun.sleep(0);
      throw new JevUnavailableError("HTTP 503 server");
    });
    const end = await awaitTactics(handle, {
      guid: 1n,
      instruction: "fight",
      signal: new AbortController().signal,
    });
    expect(end.outcome?.reason).toBe("jev_unavailable: HTTP 503 server");
    expect(jevCode(end)).toBe("jev_unavailable");
  });

  test("halts on abort", async () => {
    const handle = createMockHandle();
    const controller = new AbortController();
    handle.startTactics = jest.fn(() => new Promise<void>(() => {}));
    const waiting = awaitTactics(handle, {
      guid: 1n,
      instruction: "fight",
      signal: controller.signal,
    });
    controller.abort(new Error("esc"));
    handle.triggerTacticsEvent(started("t1", 1n));
    handle.triggerTacticsEvent({
      reason: "cancelled",
      runId: "t1",
      status: "failed",
      type: "outcome",
    });
    await waiting;
    expect(handle.halt).toHaveBeenCalled();
  });
});

describe("jevCode", () => {
  test("maps jev_timeout and leaves other outcomes", () => {
    expect(
      jevCode({
        error: undefined,
        outcome: { reason: "jev_timeout", status: "failed" },
      }),
    ).toBe("jev_unavailable");
    expect(
      jevCode({
        error: undefined,
        outcome: { reason: "server_kill_credit", status: "completed" },
      }),
    ).toBeUndefined();
    expect(
      jevCode({ error: "self_not_alive", outcome: undefined }),
    ).toBeUndefined();
  });
});

describe("awaitCycle", () => {
  test("ends at the stopped cycle event", async () => {
    const handle = createMockHandle();
    const base = handle.getCycleState();
    handle.startCycle = jest.fn(async () => {});
    handle.getCycleState = () => ({
      ...base,
      active: false,
      stopCause: "queue_done",
    });
    const waiting = awaitCycle(handle, {
      guids: [1n, 2n],
      instruction: "fight",
      maxStarts: 3,
      signal: new AbortController().signal,
    });
    handle.triggerCycleEvent({
      at: 0,
      state: handle.getCycleState(),
      type: "stopped",
    });
    expect(await waiting).toMatchObject({
      error: undefined,
      state: { active: false, stopCause: "queue_done" },
    });
    expect(handle.startCycle).toHaveBeenCalledWith([1n, 2n], "fight", 3);
  });

  test("returns the error of a rejected start", async () => {
    const handle = createMockHandle();
    handle.startCycle = jest.fn(async () => {
      throw new Error("cycle_empty_queue");
    });
    const end = await awaitCycle(handle, {
      guids: [],
      instruction: "fight",
      maxStarts: 1,
      signal: new AbortController().signal,
    });
    expect(end.error).toBe("cycle_empty_queue");
  });

  test("stops a cycle whose signal is already aborted", async () => {
    const handle = createMockHandle();
    const controller = new AbortController();
    controller.abort(new Error("human_stop"));
    handle.startCycle = jest.fn(async () => {
      handle.triggerCycleEvent({
        at: 0,
        state: handle.getCycleState(),
        type: "started",
      });
    });
    handle.stopCycle = jest.fn(() => {
      handle.triggerCycleEvent({
        at: 0,
        state: handle.getCycleState(),
        type: "stopped",
      });
    });
    const end = await awaitCycle(handle, {
      guids: [1n],
      instruction: "fight",
      maxStarts: 1,
      signal: controller.signal,
    });
    expect(end.error).toBeUndefined();
    expect(handle.stopCycle).toHaveBeenCalled();
  });

  test("stops the cycle on abort", async () => {
    const handle = createMockHandle();
    const controller = new AbortController();
    handle.startQuestCycle = jest.fn(() => new Promise<void>(() => {}));
    handle.stopCycle = jest.fn(() => {
      handle.triggerCycleEvent({
        at: 0,
        state: handle.getCycleState(),
        type: "stopped",
      });
    });
    const waiting = awaitQuestCycle(handle, {
      instruction: "fight",
      maxStarts: undefined,
      questId: 8325,
      signal: controller.signal,
      sources: [15_366],
    });
    controller.abort(new Error("human_stop"));
    await waiting;
    expect(handle.stopCycle).toHaveBeenCalled();
    expect(handle.startQuestCycle).toHaveBeenCalledWith(
      8325,
      [15_366],
      "fight",
      undefined,
    );
  });
});
