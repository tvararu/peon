import { describe, expect, test } from "bun:test";
import type { CycleTargetRecord } from "@tuicraft/core";
import type { EngageAfter } from "#harness/contract/details";
import { engageSpec } from "#harness/tools/engage";
import {
  cycleEnds,
  field,
  KILL,
  LYNX,
  STALKER,
  STALKER_2,
  stalker,
} from "#test-support/engage-fixtures";
import {
  attackBy,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";

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
    during: (t: Awaited<ReturnType<typeof field>>) => void = () => {},
  ) {
    return async () => {
      const t = await field();
      const base = t.handle.getCycleState();
      t.handle.startCycle = () => {
        setSelf(t.handle, { level: 10, ...self });
        during(t);
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
      detail: "1 of 3 kills. You have mana 72/300 (24%).",
      next: 'rest(), then engage(count: 2, target: "Springpaw Stalker")',
      reason: "low_mana",
      status: "PARTLY",
    });
  });

  test("an attacker at the low mana stop is engaged before any rest", async () => {
    const res = await lowAfterOneKill("low_mana", { power: 72 }, (t) => {
      setUnits(t.handle, [
        stalker(STALKER_2, 28),
        unitRow({
          distance: 4,
          guid: LYNX,
          name: "Springpaw Lynx",
          x: 4,
          y: 0,
        }),
      ]);
      attackBy(t.handle, LYNX);
    })();
    expect(res).toMatchObject({ reason: "low_mana", status: "PARTLY" });
    expect(res.next).toMatch(/^engage\(target: "u\d+"\)$/);
    expect(res.next).not.toContain("rest(");
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

describe("engage quest targets out of reach", () => {
  test("names the unit that could not be routed to and travels to it next", async () => {
    const t = await field();
    const state = t.handle.getQuestState();
    const counters: [number, number, number, number] = [0, 0, 0, 0];
    t.handle.getQuestState = () => ({
      ...state,
      log: {
        complete: false,
        slots: [
          { counters, expiresAtSeconds: 0, flags: 0, questId: 8325, slot: 0 },
        ],
      },
    });
    cycleEnds(
      t.handle,
      [{ cause: "target_unreachable", guid: STALKER, status: "skipped" }],
      "objective_targets_out_of_reach",
      { distance: 90, nearest: "0x20", reach: 50 },
    );
    const res = await engageSpec.run(
      { quest: "8325" },
      toolCtx<EngageAfter>(t),
    );
    const ref = t.rt.refs.refOf(STALKER);
    expect(res.detail).toStartWith(
      `Springpaw Stalker ${ref} is 90 yd away and no route to it was found.`,
    );
    expect(res.next).toBe(`travel(to: "${ref}")`);
    expect(res.next).not.toContain("look(");
  });
});
