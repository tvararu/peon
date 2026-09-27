import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import type { ControlEvent } from "@peon/core";
import { createMockHandle } from "@peon/core/test-support/mock-handle";
import type { RunEnd } from "#harness/contract/runs";
import { MOVE_JOIN_MS } from "#harness/events/move-join";
import { routerSetup } from "#test-support/router-fixture";

function world() {
  const setup = routerSetup();
  const handle = createMockHandle();
  setup.router.attach(handle);
  let finish = () => {};
  const run = setup.runs.start({
    args: { to: "explore" },
    kind: "travel",
    launch: () =>
      new Promise<RunEnd<number>>((resolve) => {
        finish = () =>
          resolve({ status: "succeeded", summary: "ok", value: 1 });
      }),
    toolCallId: "call-1",
  });
  const move = (type: ControlEvent["type"], reason?: string) =>
    handle.triggerControlEvent({
      reason,
      state: handle.getControlState(),
      type,
    });
  const legEnd = () =>
    setup.log.append({
      class: "log",
      data: { runId: run.id, status: "arrived" },
      domain: "nav",
      event: "nav/route_end",
      runId: run.id,
      text: "Route ended: arrived.",
    });
  const moves = () =>
    setup.log
      .since(0)
      .filter((row) => row.domain === "control")
      .map((row) => [row.event, row.data["cause"]]);
  return { finish: () => finish(), legEnd, move, moves, run, ...setup };
}

describe("move rows between route legs", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("a stop and start between two legs of one run leave no rows", () => {
    const w = world();
    w.move("movement_started");
    w.move("movement_stopped", "arrived");
    w.legEnd();
    w.move("movement_started");
    jest.advanceTimersByTime(MOVE_JOIN_MS * 2);
    expect(w.moves()).toEqual([["control/move_start", undefined]]);
  });

  test("a leg that ends in range logs its stop as arrived", () => {
    const w = world();
    w.move("movement_started");
    w.move("movement_stopped", "halt");
    w.legEnd();
    jest.advanceTimersByTime(MOVE_JOIN_MS);
    expect(w.moves()).toEqual([
      ["control/move_start", undefined],
      ["control/move_stop", "arrived"],
    ]);
    expect(w.log.since(0).at(-1)?.text).toBe("You stop (arrived).");
  });

  test("the run end writes a held stop before the run row", async () => {
    const w = world();
    w.move("movement_stopped", "lease");
    w.finish();
    await w.run.done;
    const events = w.log.since(0).map((row) => row.event);
    expect(events.indexOf("control/move_stop")).toBeLessThan(
      events.indexOf("run/ended"),
    );
    expect(w.moves()).toEqual([["control/move_stop", "lease"]]);
    expect(
      w.log.since(0).find((row) => row.event === "control/move_stop"),
    ).toMatchObject({ runId: w.run.id });
  });

  test("a stop outside any run is written at once", () => {
    const { log, router } = routerSetup();
    const handle = createMockHandle();
    router.attach(handle);
    handle.triggerControlEvent({
      reason: "halt",
      state: handle.getControlState(),
      type: "movement_stopped",
    });
    expect(log.since(0).map((row) => row.event)).toEqual(["control/move_stop"]);
  });
});
