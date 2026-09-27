import { expect, jest, test } from "bun:test";
import { createYieldGate, YIELD_DELAY_MS } from "#harness/runtime/yield";

test("trigger resolves every pending wait after the yield delay", async () => {
  jest.useFakeTimers();
  try {
    const gate = createYieldGate();
    const seen: string[] = [];
    gate.wait().then((why) => seen.push(`a:${why}`));
    gate.wait().then((why) => seen.push(`b:${why}`));
    gate.trigger();
    jest.advanceTimersByTime(YIELD_DELAY_MS - 1);
    await Promise.resolve();
    expect(seen).toEqual([]);
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual(["a:human", "b:human"]);
  } finally {
    jest.useRealTimers();
  }
});

test("a wait that starts after a trigger waits for the next trigger", async () => {
  jest.useFakeTimers();
  try {
    const gate = createYieldGate();
    gate.trigger();
    let resolved = false;
    gate.wait().then(() => {
      resolved = true;
    });
    jest.advanceTimersByTime(YIELD_DELAY_MS * 2);
    await Promise.resolve();
    expect(resolved).toBe(false);
    gate.trigger();
    jest.advanceTimersByTime(YIELD_DELAY_MS);
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});
