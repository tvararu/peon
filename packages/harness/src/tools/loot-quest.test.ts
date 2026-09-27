import { expect, test } from "bun:test";
import type { LootAfter } from "#harness/contract/details";
import { lootSpec } from "#harness/tools/loot";
import {
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

test("a loot that completes a logged quest points at its turn-in", async () => {
  const t = await createTestRuntime();
  setSelf(t.handle);
  setUnits(t.handle, [
    unitRow({
      distance: 2,
      guid: 0x20n,
      hp: 0,
      lootable: true,
      name: "Springpaw Stalker",
      x: 2,
      y: 0,
    }),
  ]);
  t.rt.quests.set(8326, {
    ender: "Magistrix Erona",
    giver: "Magistrix Erona",
    objectives: "Bring 6 Lynx Collars to Magistrix Erona.",
    title: "Unfortunate Measures",
  });
  const state = t.handle.getQuestState();
  const slot = (flags: number) => ({
    counters: [0, 0, 0, 0] as [number, number, number, number],
    expiresAtSeconds: undefined,
    flags,
    questId: 8326,
    slot: 0,
  });
  t.handle.getQuestState = () => ({
    ...state,
    log: { complete: true, slots: [slot(0)] },
  });
  t.handle.lootCorpse = async () => {
    t.handle.getQuestState = () => ({
      ...state,
      log: { complete: true, slots: [slot(1)] },
    });
    return {
      ok: true,
      record: {
        coinageAfter: 0,
        coinageBefore: 0,
        guid: "20",
        moneyTaken: 0,
        slotsLeft: [],
        slotsTaken: [0],
      },
    };
  };
  const res = await lootSpec.run({}, toolCtx<LootAfter>(t));
  expect(res.detail).toEndWith(" Quest 8326 complete.");
  expect(res.next).toBe('interact(do: "turn_in", npc: "Magistrix Erona")');
});
