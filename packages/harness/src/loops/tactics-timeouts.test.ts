import { expect, jest, test } from "bun:test";
import { flushMicrotasks } from "@peon/core/test-support/microtasks";
import type { JevActionResult } from "#harness/jev/contract";
import type { TacticsFrame } from "#harness/loops/tactics";
import {
  context,
  drive,
  fixture,
  frame,
  judgment,
  settle,
} from "#test-support/tactics-fixtures";

const kill: TacticsFrame = {
  ...frame,
  outcome: { status: "completed", reason: "server_kill_credit" },
};

function scripted(replies: readonly ("timeout" | "ok")[], killAfter: number) {
  let replied = 0;
  const f = fixture({
    minIntervalMs: 0,
    requestTimeoutMs: 20,
    observe: () => (f.actions.length >= killAfter ? kill : frame),
    select: () => {
      const reply = replies[replied];
      replied += 1;
      if (reply === "ok") return Promise.resolve(judgment());
      return Promise.withResolvers<JevActionResult>().promise;
    },
  });
  return f;
}

test("one timeout is discarded and the next request fights on to the kill", async () => {
  const f = scripted(["timeout", "ok"], 1);
  await settle(() => f.tactics.start(context));
  await f.stopped;
  expect(f.actions).toEqual(["smite"]);
  expect(f.events.filter((event) => event.type === "request")).toHaveLength(2);
  expect(f.events.filter((event) => event.type === "transport")).toMatchObject([
    { error: "jev_timeout" },
  ]);
  expect(f.tactics.snapshot()).toMatchObject({
    status: "idle",
    lastStopReason: "completed",
    lastOutcome: { status: "completed", reason: "server_kill_credit" },
    timeouts: { consecutive: 0, total: 1, limit: 3 },
  });
  expect(f.halts).toBe(1);
  expect(f.defenses).toBe(0);
});

test("three timeouts in a row stop with jev_timeout and defend", async () => {
  const f = scripted(["timeout", "timeout", "timeout", "ok"], 1);
  await settle(() => f.tactics.start(context));
  await f.stopped;
  expect(f.actions).toEqual([]);
  expect(f.events.filter((event) => event.type === "request")).toHaveLength(3);
  expect(f.events.filter((event) => event.type === "transport")).toHaveLength(
    3,
  );
  expect(f.tactics.snapshot()).toMatchObject({
    status: "idle",
    lastStopReason: "failed",
    lastOutcome: { status: "failed", reason: "jev_timeout" },
    lastDiscardReason: "jev_timeout",
    timeouts: { consecutive: 3, total: 3, limit: 3 },
    defense: "auto_attack",
  });
  expect(f.defenses).toBe(1);
  expect(f.halts).toBe(0);
});

test("an answered request resets the consecutive timeout count", async () => {
  const f = scripted(
    ["timeout", "timeout", "ok", "timeout", "timeout", "ok"],
    2,
  );
  await settle(() => f.tactics.start(context));
  await f.stopped;
  expect(f.actions).toEqual(["smite", "smite"]);
  expect(f.tactics.snapshot()).toMatchObject({
    lastOutcome: { status: "completed", reason: "server_kill_credit" },
    timeouts: { consecutive: 0, total: 4, limit: 3 },
  });
});

test("a reply that arrives after its timeout is discarded, not executed mid-fight", async () => {
  const late = Promise.withResolvers<JevActionResult>();
  const answered = Promise.withResolvers<JevActionResult>();
  const second = Promise.withResolvers<void>();
  let calls = 0;
  const f = fixture({
    minIntervalMs: 0,
    requestTimeoutMs: 20,
    observe: () => (f.actions.length > 0 ? kill : frame),
    select: () => {
      calls += 1;
      if (calls === 1) return late.promise;
      second.resolve();
      return answered.promise;
    },
  });
  jest.useFakeTimers();
  try {
    const running = f.tactics.start(context);
    await drive(second.promise);
    late.resolve(judgment("smite"));
    await flushMicrotasks();
    expect(f.actions).toEqual([]);
    answered.resolve(judgment("wait"));
    await drive(f.stopped);
    await running;
  } finally {
    jest.useRealTimers();
  }
  expect(f.actions).toEqual(["wait"]);
  expect(f.events).toContainEqual(
    expect.objectContaining({
      type: "discarded",
      reason: "aborted",
      actionId: "smite",
    }),
  );
  expect(f.tactics.snapshot().lastOutcome?.reason).toBe("server_kill_credit");
});

test("a timed-out call's late exchange and answer join its request by call number", async () => {
  const late = Promise.withResolvers<JevActionResult>();
  const answered = Promise.withResolvers<JevActionResult>();
  const second = Promise.withResolvers<void>();
  const exchange = { elapsedMs: 30, instructions: "q", model: "jev-latest" };
  let calls = 0;
  const f = fixture({
    minIntervalMs: 0,
    requestTimeoutMs: 20,
    observe: () => (f.actions.length > 0 ? kill : frame),
    select: (_request, { record }) => {
      calls += 1;
      if (calls === 1)
        return late.promise.then((result) => {
          record?.({ ...exchange, response: { late: true }, status: 200 });
          return result;
        });
      second.resolve();
      return answered.promise.then((result) => {
        record?.({ ...exchange, status: 200 });
        return result;
      });
    },
  });
  jest.useFakeTimers();
  try {
    const running = f.tactics.start(context);
    await drive(second.promise);
    late.resolve(judgment("smite"));
    await flushMicrotasks();
    answered.resolve(judgment("wait"));
    await drive(f.stopped);
    await running;
  } finally {
    jest.useRealTimers();
  }
  const joined = f.events.flatMap((event) =>
    "call" in event ? [[event.type, event.call]] : [],
  );
  expect(joined).toEqual([
    ["request", 1],
    ["transport", 1],
    ["request", 2],
    ["exchange", 1],
    ["result", 1],
    ["discarded", 1],
    ["exchange", 2],
    ["result", 2],
    ["applied", 2],
  ]);
  expect(f.events).toContainEqual(
    expect.objectContaining({ call: 1, response: { late: true } }),
  );
});
