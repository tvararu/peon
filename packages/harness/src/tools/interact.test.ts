import { describe, expect, test } from "bun:test";
import type { QuestDialog, QuestEvent, QuestState } from "@tuicraft/core";
import type { InteractAfter } from "#harness/contract/details";
import { interactSpec } from "#harness/tools/interact";
import {
  contentOf,
  driveGoto,
  limitProblem,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

const VELAN = 0x30n;
const NO_REWARDS = {
  arenaPoints: 0,
  choices: [],
  experience: 0,
  factions: [],
  honor: 0,
  honorMultiplier: 0,
  items: [],
  money: 0,
  reputationMask: 0,
  spellCastId: 0,
  spellId: 0,
  talents: 0,
  titleId: 0,
};
const OFFERED = [
  { icon: 2, level: 9, questId: 9254, title: "The Wayward Apprentice" },
  {
    icon: 2,
    level: 10,
    questId: 8892,
    title: "Situation at Sunsail Anchorage",
  },
];

function listDialog(
  quests: readonly {
    icon: number;
    level: number;
    questId: number;
    title: string;
  }[],
): QuestDialog {
  return {
    data: {
      emote: 0,
      emoteDelay: 0,
      guid: VELAN,
      quests: quests.map((quest) => ({ ...quest, flags: 0, repeatable: 0 })),
      title: "Greetings",
    },
    kind: "list",
  };
}

function detailsDialog(questId: number, title: string): QuestDialog {
  return {
    data: {
      activateAccept: 1,
      autoAccept: false,
      details: "",
      dividerGuid: 0n,
      emotes: [],
      flags: 0,
      guid: VELAN,
      objectives: "",
      questId,
      rewards: NO_REWARDS,
      suggestedPlayers: 0,
      title,
      unknown: 0,
    },
    kind: "details",
  };
}

function offerDialog(questId: number, title: string): QuestDialog {
  return {
    data: {
      emotes: [],
      enableNext: 0,
      flags: 0,
      guid: VELAN,
      questId,
      rewards: {
        ...NO_REWARDS,
        choices: [
          { count: 1, displayId: 0, itemId: 2046 },
          { count: 1, displayId: 0, itemId: 2047 },
        ],
      },
      rewardText: "",
      suggestedPlayers: 0,
      title,
      unknownAfterHonorMultiplier: 0,
    },
    kind: "offer",
  };
}

function answer(
  handle: MockHandle,
  type: QuestEvent["type"],
  patch: Partial<QuestState>,
  questId?: number,
): void {
  const state = { ...handle.getQuestState(), ...patch };
  handle.getQuestState = () => state;
  handle.triggerQuestEvent({ questId, source: "packet", state, type });
}

async function velan(distance = 3) {
  const t = await createTestRuntime();
  setSelf(t.handle);
  setUnits(t.handle, [
    unitRow({
      distance,
      guid: VELAN,
      name: "Velan Brightoak",
      relation: "friendly",
      roles: ["questgiver", "gossip"],
      x: distance,
      y: 0,
    }),
  ]);
  let cancelled = 0;
  t.handle.cancelInteraction = () => {
    cancelled += 1;
  };
  return { cancels: () => cancelled, t };
}

describe("interact", () => {
  test("talk lists the offers as the design example does, then closes the window", async () => {
    const { t, cancels } = await velan();
    t.handle.talk = () =>
      answer(t.handle, "dialog", { dialog: listDialog(OFFERED) });
    const res = await interactSpec.run(
      { npc: "Velan Brightoak" },
      toolCtx<InteractAfter>(t),
    );
    const ref = res.after.npc.ref;
    const text = contentOf(res);
    expect(limitProblem(text)).toBeUndefined();
    expect(text).toBe(
      [
        `DONE Velan Brightoak (${ref}) offers:`,
        "1. The Wayward Apprentice #9254 (level 9), available",
        "2. Situation at Sunsail Anchorage #8892 (level 10), available",
        "Ready to turn in: none. Not a vendor or trainer.",
        `Next: interact(do: "accept", npc: "${ref}", what: "1")`,
      ].join("\n"),
    );
    expect(cancels()).toBe(1);
  });

  test("talk that opens no quest dialog says so", async () => {
    const { t } = await velan();
    t.handle.talk = () => answer(t.handle, "window", {});
    const res = await interactSpec.run(
      { npc: "Velan Brightoak" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.detail).toBe(
      `Velan Brightoak (${res.after.npc.ref}) opened no dialog in 3 s.`,
    );
  });

  test("accept selects the quest, accepts it and points at engage", async () => {
    const { t } = await velan();
    const selected: number[] = [];
    t.handle.talk = () =>
      answer(t.handle, "dialog", { dialog: listDialog(OFFERED) });
    t.handle.selectQuest = (questId) => {
      selected.push(questId);
      answer(t.handle, "dialog", {
        dialog: detailsDialog(questId, "The Wayward Apprentice"),
      });
    };
    t.handle.acceptQuest = () => answer(t.handle, "accepted", {}, 9254);
    const res = await interactSpec.run(
      { do: "accept", npc: "Velan Brightoak", what: "1" },
      toolCtx<InteractAfter>(t),
    );
    expect(selected).toEqual([9254]);
    expect(res).toMatchObject({
      detail: "accepted The Wayward Apprentice #9254.",
      next: 'engage(quest: "9254")',
      status: "DONE",
    });
  });

  test("accept without what refuses with the numbered offers", async () => {
    const { t } = await velan();
    t.handle.talk = () =>
      answer(t.handle, "dialog", { dialog: listDialog(OFFERED) });
    await expect(
      interactSpec.run(
        { do: "accept", npc: "Velan Brightoak" },
        toolCtx<InteractAfter>(t),
      ),
    ).rejects.toMatchObject({
      body: [
        "1. The Wayward Apprentice #9254 (level 9), available",
        "2. Situation at Sunsail Anchorage #8892 (level 10), available",
      ],
      reason: "which_quest",
    });
  });

  test("turn_in refuses with the reward choices, then takes the chosen one", async () => {
    const { t } = await velan();
    const log = {
      complete: true,
      slots: [
        {
          counters: [0, 0, 0, 0] as [number, number, number, number],
          expiresAtSeconds: 0,
          flags: 1,
          questId: 8325,
          slot: 0,
        },
      ],
    };
    const chosen: number[] = [];
    t.handle.talk = () =>
      answer(t.handle, "dialog", {
        dialog: listDialog([
          { icon: 4, level: 5, questId: 8325, title: "Thinning the Ranks" },
        ]),
        log,
      });
    t.handle.completeQuest = (questId) =>
      answer(t.handle, "dialog", {
        dialog: offerDialog(questId, "Thinning the Ranks"),
      });
    t.handle.chooseQuestReward = (index) => {
      chosen.push(index);
      answer(t.handle, "rewarded", {}, 8325);
    };
    await expect(
      interactSpec.run(
        { do: "turn_in", npc: "Velan Brightoak" },
        toolCtx<InteractAfter>(t),
      ),
    ).rejects.toMatchObject({
      body: ["1. item 2046 x1", "2. item 2047 x1"],
      reason: "reward_needed",
    });
    const res = await interactSpec.run(
      { do: "turn_in", npc: "Velan Brightoak", reward: 2 },
      toolCtx<InteractAfter>(t),
    );
    expect(chosen).toEqual([1]);
    expect(res).toMatchObject({
      detail: "turned in Thinning the Ranks #8325.",
      status: "DONE",
    });
  });

  test("an NPC out of talk range is walked to first", async () => {
    const { t } = await velan(12);
    const goTo = driveGoto(t.handle, [{ arrive: { x: 9, y: 0 } }]);
    t.handle.talk = () =>
      answer(t.handle, "dialog", { dialog: listDialog(OFFERED) });
    await interactSpec.run(
      { npc: "Velan Brightoak" },
      toolCtx<InteractAfter>(t),
    );
    expect(goTo).toHaveBeenCalledWith({ guid: VELAN, kind: "guid" });
  });
});
