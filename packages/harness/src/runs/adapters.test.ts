import { describe, expect, jest, test } from "bun:test";
import {
  type ControlPose,
  type NavigationState,
  nextStepFor,
} from "@tuicraft/core";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import { awaitGoto, rawRefusal } from "#harness/runs/adapters";

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
