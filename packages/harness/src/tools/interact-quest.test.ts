import { describe, expect, test } from "bun:test";
import type { QuestLogSlot } from "@tuicraft/core";
import type { InteractAfter } from "#harness/contract/details";
import { interactSpec } from "#harness/tools/interact";
import { journalTool } from "#harness/tools/journal";
import { setUnits, toolCtx, unitRow } from "#test-support/ops-fixtures";
import {
  answer,
  detailsDialog,
  listDialog,
  MCBRIDE,
  offerDialog,
  velan,
} from "#test-support/quest-fixtures";
import { runTool } from "#test-support/tool-harness";

const THREAT = { questId: 783, title: "A Threat Within" };
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

async function acceptThreat() {
  const { t } = await velan();
  t.handle.talk = () =>
    answer(t.handle, "dialog", {
      dialog: listDialog([{ ...THREAT, icon: 2, level: 1 }]),
    });
  t.handle.selectQuest = () =>
    answer(t.handle, "dialog", {
      dialog: detailsDialog(783, THREAT.title, "Speak with Marshal McBride."),
    });
  t.handle.acceptQuest = () =>
    answer(
      t.handle,
      "accepted",
      { dialog: undefined, log: { complete: true, slots: [logged(783, 1)] } },
      783,
    );
  const res = await interactSpec.run(
    { do: "accept", npc: "Velan Brightoak", what: "1" },
    toolCtx<InteractAfter>(t),
  );
  return { res, t };
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

describe("quest handoff", () => {
  test("accept keeps the goal the details dialog showed and names the ender", async () => {
    const { res } = await acceptThreat();
    expect(res).toMatchObject({
      detail:
        "accepted A Threat Within #783. Goal: Speak with Marshal McBride.",
      next: 'interact(npc: "Marshal McBride")',
      status: "DONE",
    });
  });

  test("accept names the ref, distance and bearing of a known ender", async () => {
    const { t } = await velan();
    setUnits(t.handle, [
      ...t.handle.queryNearby(),
      unitRow({
        distance: 56,
        guid: MCBRIDE,
        name: "Marshal McBride",
        relation: "friendly",
        roles: ["questgiver"],
        x: 56,
        y: 0,
      }),
    ]);
    const ref = t.rt.refs.refOf(MCBRIDE);
    t.handle.talk = () =>
      answer(t.handle, "dialog", {
        dialog: listDialog([{ ...THREAT, icon: 2, level: 1 }]),
      });
    t.handle.selectQuest = () =>
      answer(t.handle, "dialog", {
        dialog: detailsDialog(783, THREAT.title, "Speak with Marshal McBride."),
      });
    t.handle.acceptQuest = () =>
      answer(
        t.handle,
        "accepted",
        { dialog: undefined, log: { complete: true, slots: [logged(783, 1)] } },
        783,
      );
    const res = await interactSpec.run(
      { do: "accept", npc: "Velan Brightoak", what: "1" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.detail).toBe(
      `accepted A Threat Within #783. Goal: Speak with Marshal McBride (${ref}, 56 yd N).`,
    );
  });

  test("the journal names the ender of a complete quest", async () => {
    const { t } = await acceptThreat();
    const out = await runTool(journalTool(t.rt), { about: "quests" });
    expect(out.text).toContain(
      "#783 A Threat Within: Speak with Marshal McBride; complete. Turn in to Marshal McBride.",
    );
    expect(out.details.result.after).toMatchObject({
      quests: [{ id: 783, turnIn: "Marshal McBride" }],
    });
  });

  test("no_offer with a complete quest points at its ender, not this NPC", async () => {
    const { t } = await acceptThreat();
    t.handle.talk = () =>
      answer(t.handle, "dialog", { dialog: listDialog([]) });
    await expect(
      interactSpec.run(
        { do: "turn_in", npc: "Velan Brightoak" },
        toolCtx<InteractAfter>(t),
      ),
    ).rejects.toMatchObject({
      detail: expect.stringContaining(
        "This NPC is not the ender of A Threat Within #783. Turn in to Marshal McBride.",
      ),
      next: 'interact(npc: "Marshal McBride")',
      reason: "no_offer",
    });
  });

  test("no_offer with an unknown ender looks for questgivers", async () => {
    const { t } = await velan();
    const state = t.handle.getQuestState();
    t.handle.getQuestState = () => ({
      ...state,
      log: { complete: true, slots: [logged(8325, 1)] },
    });
    t.handle.talk = () =>
      answer(t.handle, "dialog", { dialog: listDialog([]) });
    await expect(
      interactSpec.run(
        { do: "turn_in", npc: "Velan Brightoak" },
        toolCtx<InteractAfter>(t),
      ),
    ).rejects.toMatchObject({
      detail: expect.stringContaining(
        "This NPC is not the ender of quest 8325 #8325.",
      ),
      next: 'look(find: "questgiver")',
    });
  });

  test("reward_needed names the reward items", async () => {
    const t = await readyToTurnIn();
    await expect(
      interactSpec.run(
        { do: "turn_in", npc: "Velan Brightoak" },
        toolCtx<InteractAfter>(t),
      ),
    ).rejects.toMatchObject({
      body: ["1. Green Chain Boots (mail)", "2. Sunstrider Axe (axe)"],
      reason: "reward_needed",
    });
  });

  test("turn_in reports the reward from the rewarded event, not the money field", async () => {
    const t = await readyToTurnIn();
    const inventory = t.handle.getInventoryState();
    t.handle.getInventoryState = () => ({ ...inventory, coinage: 500 });
    t.handle.chooseQuestReward = () => {
      const lastReward = {
        arenaPoints: 0,
        at: 0,
        experience: 100,
        honor: 0,
        money: 30,
        questId: 8325,
        talents: 0,
      };
      answer(t.handle, "rewarded", { lastReward }, 8325);
    };
    const res = await interactSpec.run(
      { do: "turn_in", npc: "Velan Brightoak", reward: 1 },
      toolCtx<InteractAfter>(t),
    );
    expect(res.detail).toBe(
      "turned in Reclaiming Sunstrider Isle #8325. Reward: 100 XP, 30 copper, Green Chain Boots.",
    );
    expect(res.after.money).toEqual({ after: 530, before: 500 });
  });
});
