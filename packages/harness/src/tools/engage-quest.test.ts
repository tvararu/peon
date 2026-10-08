import { describe, expect, test } from "bun:test";
import type { EngageAfter } from "#harness/contract/details";
import { engageSpec } from "#harness/tools/engage";
import { cycleEnds, field, KILL, STALKER } from "#test-support/engage-fixtures";
import { contentOf, toolCtx } from "#test-support/ops-fixtures";

describe("engage quest", () => {
  test("an item quest with no known source refuses with the ask for a creature", async () => {
    const t = await field();
    const state = t.handle.getQuestState();
    const counters: [number, number, number, number] = [0, 0, 0, 0];
    t.handle.getQuestState = () => ({
      ...state,
      log: {
        complete: true,
        slots: [
          { counters, expiresAtSeconds: 0, flags: 0, questId: 8325, slot: 0 },
        ],
      },
    });
    cycleEnds(t.handle, [], "objective_item_sources_unknown");
    const res = await engageSpec.run(
      { quest: "8325" },
      toolCtx<EngageAfter>(t),
    );
    expect(res).toMatchObject({
      next: 'engage(quest: "8325", target: "<creature name>")',
      reason: "item_sources_unknown",
      status: "REFUSED",
    });
  });

  test("a quest start error after a stale complete state refuses with no tally", async () => {
    const t = await field();
    const state = t.handle.getQuestState();
    const counters: [number, number, number, number] = [0, 0, 0, 0];
    t.handle.getQuestState = () => ({
      ...state,
      log: {
        complete: true,
        slots: [
          { counters, expiresAtSeconds: 0, flags: 0, questId: 8325, slot: 0 },
        ],
      },
    });
    const stale = t.handle.getCycleState();
    t.handle.getCycleState = () => ({
      ...stale,
      active: false,
      phase: "stopped",
      stopCause: "objective_complete",
    });
    t.handle.startQuestCycle = async () => {
      throw new Error("objective_item_sources_unknown");
    };
    const res = await engageSpec.run(
      { quest: "8325" },
      toolCtx<EngageAfter>(t),
    );
    expect(res).toMatchObject({
      next: 'engage(quest: "8325", target: "<creature name>")',
      reason: "item_sources_unknown",
      status: "REFUSED",
    });
    expect(res.after).toMatchObject({ kills: 0, xp: 0 });
    expect(contentOf(res)).not.toContain("nothing left to kill");
  });

  test("a quest start error after a stale kill refuses with no carried kills", async () => {
    const t = await field();
    const state = t.handle.getQuestState();
    const counters: [number, number, number, number] = [0, 0, 0, 0];
    t.handle.getQuestState = () => ({
      ...state,
      log: {
        complete: true,
        slots: [
          { counters, expiresAtSeconds: 0, flags: 0, questId: 8325, slot: 0 },
        ],
      },
    });
    const stale = t.handle.getCycleState();
    t.handle.getCycleState = () => ({
      ...stale,
      active: false,
      phase: "stopped",
      queue: [
        {
          guid: STALKER,
          loot: "looted",
          outcome: KILL,
          status: "done" as const,
        },
      ],
      stopCause: "queue_exhausted",
    });
    t.handle.startQuestCycle = async () => {
      throw new Error("objective_item_sources_unknown");
    };
    const res = await engageSpec.run(
      { quest: "8325" },
      toolCtx<EngageAfter>(t),
    );
    expect(res).toMatchObject({
      next: 'engage(quest: "8325", target: "<creature name>")',
      reason: "item_sources_unknown",
      status: "REFUSED",
    });
    expect(res.after).toMatchObject({ kills: 0, xp: 0 });
    expect(contentOf(res)).not.toContain("killed");
  });
});
