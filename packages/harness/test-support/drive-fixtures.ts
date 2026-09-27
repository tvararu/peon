import type { DriveTimers } from "#harness/drive/held";

export type ManualTimers = DriveTimers & { advance: (ms: number) => void };

export function manualTimers(): ManualTimers {
  let now = 0;
  let next = 0;
  const due = new Map<number, { at: number; cb: () => void }>();
  return {
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const [id, timer] =
          [...due].toSorted(([, a], [, b]) => a.at - b.at)[0] ?? [];
        if (id === undefined || !timer || timer.at > end) break;
        due.delete(id);
        now = timer.at;
        timer.cb();
      }
      now = end;
    },
    clear: (timer) => due.delete(timer as number),
    now: () => now,
    set(cb, ms) {
      next += 1;
      due.set(next, { at: now + ms, cb });
      return next;
    },
  };
}
