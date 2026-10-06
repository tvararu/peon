import { expect, test } from "bun:test";
import type { TacticsEvent } from "#harness/loops/tactics";
import { createMockGame } from "#test-support/mock-game";
import { moveTo } from "#test-support/ops-fixtures";
import { routerSetup as setup } from "#test-support/router-fixture";

const idle = {
  instruction: "pilot",
  lastDecision: undefined,
  lastDiscardReason: undefined,
  lastOutcome: undefined,
  lastRequest: undefined,
  lastResult: undefined,
  runId: "p1",
  status: "idle",
  targetGuid: undefined,
  timeouts: { consecutive: 0, limit: 3, total: 0 },
} as const;

function feed(trigger: (event: TacticsEvent) => void) {
  trigger({
    framing: "none",
    instruction: "pilot",
    objective: { kind: "reach", x: 10, y: 20 },
    runId: "p1",
    targetGuid: undefined,
    type: "started",
  });
  trigger({
    actionId: "run_ahead",
    ageMs: 5,
    call: 1,
    runId: "p1",
    type: "applied",
  });
  trigger({
    actionId: "jump_ahead",
    ageMs: 5,
    call: 2,
    runId: "p1",
    type: "applied",
  });
  trigger({
    reason: "goal_reached",
    runId: "p1",
    state: idle,
    type: "stopped",
  });
}

test("pilot events write jev.jsonl rows tagged loop pilot and pilot game-log rows", () => {
  const { jevRows, log, router } = setup();
  const handle = createMockGame();
  moveTo(handle, { x: 1, y: 2, z: 3 });
  router.attach(handle);
  feed((event) => handle.triggerPilotEvent(event));
  const rows = jevRows as { loop: string; type: string }[];
  expect(rows.map((row) => row.type)).toEqual([
    "started",
    "applied",
    "applied",
    "stopped",
  ]);
  expect(new Set(rows.map((row) => row.loop))).toEqual(new Set(["pilot"]));
  const events = log.since(0).map((row) => row.event);
  expect(events).toEqual([
    "pilot/started",
    "pilot/decision",
    "pilot/decision",
    "pilot/ended",
  ]);
  const ended = log.since(0).find((row) => row.event === "pilot/ended");
  expect(ended?.data).toMatchObject({
    decisions: 2,
    jumps: 1,
    reason: "goal_reached",
    runId: "p1",
  });
});

test("outcome then stopped emits exactly one pilot/ended row with the tally", () => {
  const { log, router } = setup();
  const handle = createMockGame();
  moveTo(handle, { x: 1, y: 2, z: 3 });
  router.attach(handle);
  handle.triggerPilotEvent({
    framing: "none",
    instruction: "pilot",
    objective: { kind: "reach", x: 10, y: 20 },
    runId: "p1",
    targetGuid: undefined,
    type: "started",
  });
  handle.triggerPilotEvent({
    actionId: "run_ahead",
    ageMs: 5,
    call: 1,
    runId: "p1",
    type: "applied",
  });
  handle.triggerPilotEvent({
    reason: "goal_reached",
    runId: "p1",
    status: "completed",
    type: "outcome",
  });
  handle.triggerPilotEvent({
    reason: "completed",
    runId: "p1",
    state: {
      ...idle,
      lastOutcome: { reason: "goal_reached", status: "completed" },
    },
    type: "stopped",
  });
  const ended = log.since(0).filter((row) => row.event === "pilot/ended");
  expect(ended).toHaveLength(1);
  expect(ended[0]?.data).toMatchObject({
    decisions: 1,
    reason: "goal_reached",
    runId: "p1",
    status: "completed",
  });
});

test("an attacked stop ends the pilot stopped with the attack reason", () => {
  const { log, router } = setup();
  const handle = createMockGame();
  moveTo(handle, { x: 1, y: 2, z: 3 });
  router.attach(handle);
  handle.triggerPilotEvent({
    framing: "none",
    instruction: "pilot",
    objective: { kind: "reach", x: 10, y: 20 },
    runId: "p1",
    targetGuid: undefined,
    type: "started",
  });
  handle.triggerPilotEvent({
    reason: "attacked",
    runId: "p1",
    state: idle,
    type: "stopped",
  });
  const ended = log.since(0).filter((row) => row.event === "pilot/ended");
  expect(ended).toHaveLength(1);
  expect(ended[0]?.data).toMatchObject({
    reason: "attacked",
    runId: "p1",
    status: "stopped",
  });
});
