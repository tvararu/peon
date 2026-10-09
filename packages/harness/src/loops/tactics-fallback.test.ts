import { expect, test } from "bun:test";
import { JevTransportError } from "#harness/jev/failure";
import type { TacticsFrame } from "#harness/loops/tactics";
import {
  context,
  fixture,
  frame,
  judgment,
  settle,
} from "#test-support/tactics-fixtures";

const kill: TacticsFrame = {
  ...frame,
  outcome: { status: "completed", reason: "server_kill_credit" },
};

test("a failing Jev transport falls back to local actions and ends the fight", async () => {
  let selects = 0;
  const f = fixture({
    minIntervalMs: 0,
    requestTimeoutMs: 20,
    observe: () => (f.actions.length >= 2 ? kill : frame),
    select: () => {
      selects += 1;
      throw new JevTransportError("TypeSafe HTTP 503");
    },
    fallback: (current) => current.candidates[0]?.id,
  });
  await settle(() => f.tactics.start(context));
  await f.stopped;
  expect(selects).toBeGreaterThanOrEqual(3);
  expect(f.actions).toEqual(["smite", "smite"]);
  expect(f.events.filter((event) => event.type === "fallback")).toMatchObject([
    { actionId: "smite" },
    { actionId: "smite" },
  ]);
  expect(f.tactics.snapshot()).toMatchObject({
    lastStopReason: "completed",
    lastOutcome: { status: "completed", reason: "server_kill_credit" },
  });
});

test("Jev answering again ends the fallback and its action wins", async () => {
  let selects = 0;
  const f = fixture({
    minIntervalMs: 0,
    requestTimeoutMs: 20,
    observe: () => (f.actions.length >= 3 ? kill : frame),
    select: () => {
      selects += 1;
      if (selects <= 3) throw new JevTransportError("TypeSafe HTTP 503");
      return Promise.resolve(judgment());
    },
    fallback: (current) => current.candidates[0]?.id,
  });
  await settle(() => f.tactics.start(context));
  await f.stopped;
  expect(f.actions).toEqual(["smite", "smite", "smite"]);
  expect(f.events.filter((event) => event.type === "fallback")).toHaveLength(1);
  expect(f.tactics.snapshot().lastOutcome).toMatchObject({
    status: "completed",
    reason: "server_kill_credit",
  });
});

test("without a fallback the third transport failure still ends jev_unavailable", async () => {
  const f = fixture({
    minIntervalMs: 0,
    select: () => {
      throw new JevTransportError("TypeSafe HTTP 503");
    },
  });
  await expect(settle(() => f.tactics.start(context))).rejects.toThrow(
    "jev_unavailable: transport TypeSafe HTTP 503 (3 in a row)",
  );
  expect(f.events.some((event) => event.type === "fallback")).toBe(false);
});
