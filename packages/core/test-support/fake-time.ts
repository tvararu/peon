import { jest } from "bun:test";

const STEP_MS = 10;

function turn(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setImmediate(resolve);
  return promise;
}

export async function withFakeTimers<T>(body: () => Promise<T>): Promise<T> {
  jest.useFakeTimers();
  try {
    return await body();
  } finally {
    jest.useRealTimers();
  }
}

export async function elapse(ms: number): Promise<void> {
  await turn();
  for (let passed = 0; passed < ms; passed += STEP_MS) {
    jest.advanceTimersByTime(Math.min(STEP_MS, ms - passed));
    await turn();
  }
}

export async function fakeMsUntilSettled(
  promise: Promise<unknown>,
  limitMs: number,
): Promise<number> {
  let settled = false;
  const done = () => {
    settled = true;
  };
  promise.then(done, done);
  const started = performance.now();
  await turn();
  while (!settled && performance.now() - started < limitMs) {
    const left = limitMs - (performance.now() - started);
    jest.advanceTimersByTime(Math.min(STEP_MS, left));
    await turn();
  }
  const ms = performance.now() - started;
  if (!settled) throw new Error(`still pending after ${ms} fake ms`);
  return ms;
}

export function fakeTimed<T>(
  start: () => Promise<T>,
  limitMs: number,
): Promise<{ ms: number; run: Promise<T> }> {
  return withFakeTimers(async () => {
    const run = start();
    return { ms: await fakeMsUntilSettled(run, limitMs), run };
  });
}
