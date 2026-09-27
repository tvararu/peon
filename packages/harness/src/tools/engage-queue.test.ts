import { describe, expect, test } from "bun:test";
import type { CycleTargetRecord } from "@tuicraft/core";
import type { EngageAfter } from "#harness/contract/details";
import { engageSpec } from "#harness/tools/engage";
import { field, KILL, STALKER, STALKER_2 } from "#test-support/engage-fixtures";
import { attackBy, setSelf, toolCtx } from "#test-support/ops-fixtures";

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

describe("engage pull gate", () => {
  function lowAfterOneKill(
    stopCause: string,
    self: { hp?: number; power?: number },
  ) {
    return async () => {
      const t = await field();
      const base = t.handle.getCycleState();
      t.handle.startCycle = () => {
        setSelf(t.handle, { level: 10, ...self });
        const stopped = {
          ...base,
          active: false,
          phase: "stopped" as const,
          queue: [
            {
              guid: STALKER,
              loot: "looted" as const,
              outcome: KILL,
              status: "done" as const,
            },
            { guid: STALKER_2, status: "queued" as const },
          ],
          stopCause,
        };
        queueMicrotask(() => {
          t.handle.getCycleState = () => stopped;
          t.handle.triggerCycleEvent({
            at: 0,
            state: stopped,
            type: "stopped",
          });
        });
        return Promise.resolve();
      };
      return engageSpec.run(
        { count: 3, target: "Springpaw Stalker" },
        toolCtx<EngageAfter>(t),
      );
    };
  }

  test("a cycle stopped at low mana is PARTLY with the kills and a rest step", async () => {
    const res = await lowAfterOneKill("low_mana", { power: 72 })();
    expect(res).toMatchObject({
      detail: "1 of 3 kills. You are at 24% mana.",
      next: 'rest(), then engage(count: 2, target: "Springpaw Stalker")',
      reason: "low_mana",
      status: "PARTLY",
    });
  });

  test("a cycle stopped at low health names the health", async () => {
    const res = await lowAfterOneKill("low_health", { hp: 80 })();
    expect(res).toMatchObject({
      detail: "1 of 3 kills. You are at 40% HP.",
      reason: "low_health",
      status: "PARTLY",
    });
  });
});
