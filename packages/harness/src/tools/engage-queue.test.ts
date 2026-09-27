import { describe, expect, test } from "bun:test";
import type { CycleTargetRecord } from "@tuicraft/core";
import type { EngageAfter } from "#harness/contract/details";
import { engageSpec } from "#harness/tools/engage";
import { field, KILL, STALKER } from "#test-support/engage-fixtures";
import { attackBy, toolCtx } from "#test-support/ops-fixtures";

const UNSEEN = 0x99n;

describe("engage cycle queue", () => {
  test("an attacker that is not in view is not queued for a fight", async () => {
    const t = await field();
    const calls: bigint[][] = [];
    const base = t.handle.getCycleState();
    t.handle.startCycle = (guids) => {
      calls.push([...guids]);
      if (calls.length === 1) attackBy(t.handle, UNSEEN);
      const records: CycleTargetRecord[] = [
        { guid: STALKER, loot: "looted", outcome: KILL, status: "done" },
      ];
      const stopped = {
        ...base,
        active: false,
        phase: "stopped" as const,
        queue: records,
        stopCause: "queue_exhausted",
      };
      queueMicrotask(() => {
        t.handle.getCycleState = () => stopped;
        t.handle.triggerCycleEvent({ at: 0, state: stopped, type: "stopped" });
      });
      return Promise.resolve();
    };
    await engageSpec.run(
      { count: 3, target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(calls.flat()).not.toContain(UNSEEN);
  });
});
