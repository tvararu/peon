import { describe, expect, test } from "bun:test";
import type { QuestLogSlot } from "@peon/core";
import type { TravelAfter } from "#harness/contract/details";
import { travelSpec } from "#harness/tools/travel";
import { driveGoto, setSelf, toolCtx } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

function slot(flags: number): QuestLogSlot {
  return {
    counters: [0, 0, 0, 0],
    expiresAtSeconds: undefined,
    flags,
    questId: 62,
    slot: 0,
  };
}

async function world(flags: number) {
  const t = await createTestRuntime();
  setSelf(t.handle, { x: 0, y: 0 });
  const state = t.handle.getQuestState();
  t.handle.getQuestState = () => ({
    ...state,
    log: { complete: true, slots: [slot(flags)] },
  });
  t.rt.travel.triggers = { points: ["10, 0", "20, 0", "30, 0"], questId: 62 };
  return t;
}

async function reach(t: Awaited<ReturnType<typeof world>>, to: string) {
  const [x, y] = to.split(",").map(Number);
  driveGoto(t.handle, [{ arrive: { x: x ?? 0, y: y ?? 0 } }]);
  return travelSpec.run({ to }, toolCtx<TravelAfter>(t));
}

describe("travel between a quest region's area triggers", () => {
  test("names the next trigger while the quest is unfinished", async () => {
    const t = await world(0);
    const first = await reach(t, "10, 0");
    expect(first.next).toBe('travel(to: "20, 0")');
    const second = await reach(t, "20, 0");
    expect(second.next).toBe('travel(to: "30, 0")');
  });

  test("stops after the last trigger", async () => {
    const t = await world(0);
    const last = await reach(t, "30, 0");
    expect(last.next).toBeUndefined();
  });

  test("stops once the quest is complete", async () => {
    const t = await world(1);
    const first = await reach(t, "10, 0");
    expect(first.next).toBeUndefined();
  });
});
