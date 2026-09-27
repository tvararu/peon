import { describe, expect, jest, test } from "bun:test";
import { drive, settle } from "#test-support/tactics-fixtures";
import type { JevActionResult, JevSelect } from "#wow/jev";
import { JevTransportError, JevUnavailableError } from "#wow/jev-failure";
import { type TacticsEvent, TacticsLoop, TRANSPORT_LIMIT } from "#wow/tactics";

const mockResult: JevActionResult = {
  choice: "spell:585:target",
  probabilities: { "spell:585:target": 1, wait: 0 },
  confidence: 0.9,
  model: "jev-1.13.0",
  inputTokens: 100,
  elapsedMs: 250,
};

const context = { targetGuid: 1n, instruction: "kill" };
const frame = {
  observation: {},
  candidates: [
    { id: "wait", description: "Wait" },
    { id: "spell:585:target", description: "Smite" },
  ],
};

function delayed(delayMs: number): JevSelect {
  return () =>
    new Promise((resolve) => setTimeout(() => resolve(mockResult), delayMs));
}

function failing(error: () => Error): JevSelect {
  return async () => {
    throw error();
  };
}

function providerLoop(
  select: JevSelect,
  fault: string,
  maxResultAgeMs?: number,
) {
  const loop = new TacticsLoop({
    maxResultAgeMs,
    minIntervalMs: 0,
    select,
    fault,
    prepare: async () => {},
    activate: () => {},
    observe: () => frame,
    execute: () => {},
    halt: () => {},
    defend: () => "none",
  });
  const events: TacticsEvent[] = [];
  const waiters: {
    predicate: (event: TacticsEvent) => boolean;
    resolve: (event: TacticsEvent) => void;
  }[] = [];
  loop.onEvent((event) => {
    events.push(event);
    for (const waiter of waiters)
      if (waiter.predicate(event)) waiter.resolve(event);
  });
  const until = (predicate: (event: TacticsEvent) => boolean) =>
    new Promise<TacticsEvent>((resolve) => {
      const seen = events.find(predicate);
      if (seen) resolve(seen);
      else waiters.push({ predicate, resolve });
    });
  return { loop, events, until };
}

describe("TacticsLoop provider failures", () => {
  test("delayed response past maxResultAgeMs yields stale_age discard", async () => {
    const { loop, events, until } = providerLoop(delayed(50), "delay:50ms", 20);
    jest.useFakeTimers();
    try {
      const started = loop.start(context);
      await drive(
        until((e) => e.type === "discarded" && e.reason === "stale_age"),
      );
      loop.stop("done");
      await started;
    } finally {
      jest.useRealTimers();
    }
    expect(events[0]).toMatchObject({ type: "started", fault: "delay:50ms" });
    expect(loop.snapshot().fault).toBe("delay:50ms");
  });

  test("delayed response with halt during delay yields aborted discard", async () => {
    const { loop, until } = providerLoop(delayed(50), "delay:50ms");
    jest.useFakeTimers();
    let discarded: TacticsEvent;
    try {
      const started = loop.start(context);
      await until((e) => e.type === "request");
      loop.stop("halt");
      await started;
      const settled = until((e) => e.type === "discarded");
      await drive(settled);
      discarded = await settled;
    } finally {
      jest.useRealTimers();
    }
    expect(discarded).toMatchObject({
      reason: "aborted",
      actionId: "spell:585:target",
    });
    expect(loop.snapshot().lastStopReason).toBe("halt");
  });

  test("a refused key ends the run at once as jev_unavailable", async () => {
    const refused = () => new JevUnavailableError("HTTP 402 payment_required");
    const { loop, events } = providerLoop(failing(refused), "http:402");
    const reason = "jev_unavailable: HTTP 402 payment_required";
    await expect(settle(() => loop.start(context))).rejects.toThrow(reason);
    const transport = events.filter((e) => e.type === "transport");
    expect(transport.map((e) => e.type === "transport" && e.error)).toEqual([
      reason,
    ]);
    expect(loop.snapshot()).toMatchObject({
      fault: "http:402",
      status: "idle",
      lastStopReason: "failed",
      lastOutcome: { status: "failed", reason },
    });
  });

  test("repeated server errors end the run as jev_unavailable", async () => {
    const busy = () => new JevTransportError("TypeSafe HTTP 503");
    const { loop, events } = providerLoop(failing(busy), "http:503");
    await expect(settle(() => loop.start(context))).rejects.toThrow(
      `jev_unavailable: transport TypeSafe HTTP 503 (${TRANSPORT_LIMIT} in a row)`,
    );
    const transport = events.filter((e) => e.type === "transport");
    expect(transport).toHaveLength(TRANSPORT_LIMIT);
    expect(transport[0]?.error).toBe("TypeSafe HTTP 503");
    expect(loop.snapshot().lastStopReason).toBe("failed");
  });

  test("repeated network failures end the run as jev_unavailable", async () => {
    const offline = () => new JevTransportError("fetch failed");
    const { loop, events } = providerLoop(
      failing(offline),
      "transport:network",
    );
    await expect(settle(() => loop.start(context))).rejects.toThrow(
      "jev_unavailable: transport fetch failed",
    );
    const transport = events.filter((e) => e.type === "transport");
    expect(transport[0]?.error).toBe("fetch failed");
    expect(loop.snapshot().fault).toBe("transport:network");
    expect(loop.snapshot().lastStopReason).toBe("failed");
  });

  test("a transport failure short of the limit keeps the fight going", async () => {
    let calls = 0;
    let hit = false;
    const loop = new TacticsLoop({
      minIntervalMs: 0,
      select: async () => {
        calls++;
        if (calls < TRANSPORT_LIMIT)
          throw new JevTransportError("fetch failed");
        return mockResult;
      },
      prepare: async () => {},
      activate: () => {},
      observe: () => ({
        ...frame,
        outcome: hit ? { status: "completed", reason: "killed" } : undefined,
      }),
      execute: () => {
        hit = true;
      },
      halt: () => {},
      defend: () => "none",
    });
    await settle(() => loop.start(context));
    expect(calls).toBe(TRANSPORT_LIMIT);
    expect(loop.snapshot().lastOutcome).toMatchObject({
      status: "completed",
      reason: "killed",
    });
  });
});
