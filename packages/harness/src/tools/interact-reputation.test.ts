import { describe, expect, test } from "bun:test";
import type { QuestLogSlot } from "@peon/core";
import { elapse, withFakeTimers } from "@peon/core/test-support/fake-time";
import type { InteractAfter } from "#harness/contract/details";
import { interactSpec } from "#harness/tools/interact";
import { toolCtx } from "#test-support/ops-fixtures";
import {
  answer,
  listDialog,
  offerDialog,
  velan,
} from "#test-support/quest-fixtures";

const RECLAIMING = { questId: 8325, title: "Reclaiming Sunstrider Isle" };

function logged(questId: number, flags: number): QuestLogSlot {
  return {
    counters: [0, 0, 0, 0],
    expiresAtSeconds: undefined,
    flags,
    questId,
    slot: 0,
  };
}

async function readyToTurnIn() {
  const { t } = await velan();
  const log = { complete: true, slots: [logged(8325, 1)] };
  t.handle.talk = () =>
    answer(t.handle, "dialog", {
      dialog: listDialog([{ ...RECLAIMING, icon: 4, level: 1 }]),
      log,
    });
  t.handle.completeQuest = (questId) =>
    answer(t.handle, "dialog", {
      dialog: offerDialog(questId, RECLAIMING.title),
    });
  return t;
}

function standing(
  name: string,
  repListId: number,
  before: number,
  after: number,
) {
  return {
    after,
    atWar: false,
    before,
    factionId: repListId,
    increased: after > before,
    name,
    rank: 4,
    rankChanged: false,
    repListId,
    type: "standing_changed" as const,
    wasAtWar: false,
  };
}

const lastReward = {
  arenaPoints: 0,
  at: 0,
  experience: 100,
  honor: 0,
  money: 30,
  questId: 8325,
  talents: 0,
};

describe("turn-in reputation", () => {
  test("lists the standings that arrived with the reward", async () => {
    const t = await readyToTurnIn();
    t.handle.chooseQuestReward = () => {
      t.handle.triggerAreaEvent(
        "reputation",
        standing("Silvermoon City", 55, 4000, 4250),
      );
      t.handle.triggerAreaEvent(
        "reputation",
        standing("Orgrimmar", 14, 500, 562),
      );
      answer(t.handle, "rewarded", { lastReward }, 8325);
    };
    const res = await withFakeTimers(async () => {
      const run = interactSpec.run(
        { do: "turn_in", npc: "Velan Brightoak", reward: 1 },
        toolCtx<InteractAfter>(t),
      );
      await elapse(1000);
      return run;
    });
    expect(res.detail).toContain("Silvermoon City");
    expect(res.detail).toContain("+250");
    expect(res.detail).toContain("Orgrimmar");
    expect(res.detail).toContain("+62");
    expect(res.after.reputation).toEqual([
      { after: 4250, before: 4000, name: "Silvermoon City" },
      { after: 562, before: 500, name: "Orgrimmar" },
    ]);
  });

  test("keeps a standing that arrives just after the rewarded event", async () => {
    const t = await readyToTurnIn();
    t.handle.chooseQuestReward = () => {
      answer(t.handle, "rewarded", { lastReward }, 8325);
      queueMicrotask(() =>
        t.handle.triggerAreaEvent(
          "reputation",
          standing("Silvermoon City", 55, 4000, 4250),
        ),
      );
    };
    const outcome = await withFakeTimers(async () => {
      const run = interactSpec.run(
        { do: "turn_in", npc: "Velan Brightoak", reward: 1 },
        toolCtx<InteractAfter>(t),
      );
      await elapse(1000);
      return run;
    });
    expect(outcome.after.reputation).toEqual([
      { after: 4250, before: 4000, name: "Silvermoon City" },
    ]);
  });

  test("a turn-in with no standings reports an empty list", async () => {
    const t = await readyToTurnIn();
    t.handle.chooseQuestReward = () =>
      answer(t.handle, "rewarded", { lastReward }, 8325);
    const res = await withFakeTimers(async () => {
      const run = interactSpec.run(
        { do: "turn_in", npc: "Velan Brightoak", reward: 1 },
        toolCtx<InteractAfter>(t),
      );
      await elapse(1000);
      return run;
    });
    expect(res.after.reputation).toEqual([]);
  });

  test("an abort during the wait rejects with the abort reason", async () => {
    const t = await readyToTurnIn();
    t.handle.chooseQuestReward = () =>
      answer(t.handle, "rewarded", { lastReward }, 8325);
    const controller = new AbortController();
    const ctx = { ...toolCtx<InteractAfter>(t), signal: controller.signal };
    const outcome = await withFakeTimers(async () => {
      const run = interactSpec
        .run({ do: "turn_in", npc: "Velan Brightoak", reward: 1 }, ctx)
        .then(
          () => "resolved",
          (error: unknown) => (error instanceof Error ? error.name : error),
        );
      await elapse(1);
      controller.abort();
      await elapse(1);
      return run;
    });
    expect(outcome).toBe("AbortError");
  });
});
