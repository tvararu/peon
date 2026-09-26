import type { YieldGate } from "#harness/contract/services";

export const YIELD_DELAY_MS = 50;

export function createYieldGate(): YieldGate {
  let waiters: ((why: "human") => void)[] = [];
  return {
    trigger() {
      const due = waiters;
      waiters = [];
      setTimeout(() => {
        for (const resolve of due) resolve("human");
      }, YIELD_DELAY_MS);
    },
    wait() {
      const { promise, resolve } = Promise.withResolvers<"human">();
      waiters.push(resolve);
      return promise;
    },
  };
}
