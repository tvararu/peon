import { describe, expect, jest, test } from "bun:test";
import type { AreaState, QuestDialog, QuestLogSlot } from "@peon/core";
import { elapse, withFakeTimers } from "@peon/core/test-support/fake-time";
import type { InteractAfter } from "#harness/contract/details";
import { interactSpec } from "#harness/tools/interact";
import { ANSWER_MS } from "#harness/tools/interact-quest";
import { journalTool } from "#harness/tools/journal";
import { moveTo, setUnits, toolCtx, unitRow } from "#test-support/ops-fixtures";
import {
  answer,
  detailsDialog,
  listDialog,
  MCBRIDE,
  offerDialog,
  VELAN,
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

  test("an unanswered accept points at the quest log, not at another accept", async () => {
    const { t } = await velan();
    t.handle.talk = () =>
      answer(t.handle, "dialog", {
        dialog: detailsDialog(783, THREAT.title, "Speak with Marshal McBride."),
      });
    let accepts = 0;
    t.handle.acceptQuest = () => {
      accepts += 1;
      jest.advanceTimersByTime(ANSWER_MS);
    };
    const run = withFakeTimers(() =>
      interactSpec.run(
        { do: "accept", npc: "Velan Brightoak", what: "1" },
        toolCtx<InteractAfter>(t),
      ),
    );
    await expect(run).rejects.toMatchObject({
      next: 'journal(about: "quests")',
      reason: "no_answer",
      status: "UNCONFIRMED",
    });
    expect(accepts).toBe(1);
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
    const out = await runTool(journalTool.definition(t.rt), {
      about: "quests",
    });
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

type QuestsAreaState = AreaState<"quests">;

const POI = {
  flags: 0,
  icon: 7,
  importance: 0,
  name: "Lion's Pride Inn",
  x: -9459,
  y: 42.08,
};

type TextOption = {
  emotes: { delay: number; emote: number }[];
  language: number;
  probability: number;
  text0: string;
  text1: string;
};

function textOption(text0: string, probability = 1): TextOption {
  return {
    emotes: [
      { delay: 0, emote: 0 },
      { delay: 0, emote: 0 },
      { delay: 0, emote: 0 },
    ],
    language: 7,
    probability,
    text0,
    text1: text0,
  };
}

function optionsOf(text0: string, probability = 1): TextOption[] {
  return [
    textOption(text0, probability),
    ...Array.from({ length: 7 }, () => textOption("", 0)),
  ];
}

function greetDialog(textId: number, options: number): QuestDialog {
  return {
    data: {
      guid: VELAN,
      menuId: 1,
      options: Array.from({ length: options }, (_, index) => ({
        boxText: "",
        coded: 0,
        icon: 0,
        money: 0,
        optionIndex: index,
        text: `Direction ${index + 1}`,
      })),
      quests: [],
      titleTextId: textId,
    },
    kind: "gossip",
  };
}

function gossipWithPoi(textId: number): QuestDialog {
  return {
    data: {
      guid: VELAN,
      menuId: 3506,
      options: [
        {
          boxText: "",
          coded: 0,
          icon: 0,
          money: 0,
          optionIndex: 1,
          text: "Bank",
        },
        {
          boxText: "",
          coded: 0,
          icon: 0,
          money: 0,
          optionIndex: 2,
          text: "The guild master",
        },
        {
          boxText: "",
          coded: 0,
          icon: 0,
          money: 0,
          optionIndex: 3,
          text: "Inn",
        },
      ],
      quests: [],
      titleTextId: textId,
    },
    kind: "gossip",
  };
}

function spyQuests(
  t: { handle: { quests: { state: () => QuestsAreaState } } },
  state: QuestsAreaState,
): void {
  jest.spyOn(t.handle.quests, "state").mockReturnValue(state);
}

function selfBloodElf(t: { rt: { ready: { inWorld: () => unknown } } }): void {
  t.rt.ready.inWorld = () => ({
    className: "Priest",
    race: "Blood Elf",
  });
}

describe("talk greetings", () => {
  test("talk shows the greeting with the name, class and race filled in", async () => {
    const { t } = await velan();
    selfBloodElf(t);
    const state: QuestsAreaState = {
      completed: undefined,
      gossipPoi: undefined,
      marks: new Map(),
      pois: new Map(),
      texts: new Map([
        [
          16_703,
          {
            at: 1,
            guid: VELAN,
            options: optionsOf("$N! Work, $C of the $R."),
            status: "known",
          },
        ],
      ]),
    };
    spyQuests(t, state);
    t.handle.talk = () =>
      answer(t.handle, "dialog", { dialog: greetDialog(16_703, 2) });
    const res = await interactSpec.run(
      { npc: "Velan Brightoak" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.detail).toContain("Testchar! Work, Priest of the Blood Elf.");
    expect(res.detail).not.toContain("$N");
  });

  test("talk hides the server fallback greeting", async () => {
    const { t } = await velan();
    selfBloodElf(t);
    const state: QuestsAreaState = {
      completed: undefined,
      gossipPoi: undefined,
      marks: new Map(),
      pois: new Map(),
      texts: new Map([
        [
          999_999,
          {
            at: 1,
            guid: VELAN,
            options: optionsOf("Greetings $N", 0),
            status: "known",
          },
        ],
      ]),
    };
    spyQuests(t, state);
    t.handle.talk = () =>
      answer(t.handle, "dialog", { dialog: greetDialog(999_999, 1) });
    const res = await interactSpec.run(
      { npc: "Velan Brightoak" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.body.join("\n")).toContain("Direction 1");
    expect(res.detail).not.toContain("Greetings");
  });

  test("talk waits for the greeting that arrives after the dialog", async () => {
    const { t } = await velan();
    selfBloodElf(t);
    const known: QuestsAreaState = {
      completed: undefined,
      gossipPoi: undefined,
      marks: new Map(),
      pois: new Map(),
      texts: new Map([
        [
          16_703,
          {
            at: 2,
            guid: VELAN,
            options: optionsOf("$N, ready."),
            status: "known",
          },
        ],
      ]),
    };
    const pending: QuestsAreaState = {
      ...known,
      texts: new Map([
        [16_703, { at: 1, guid: VELAN, options: [], status: "pending" }],
      ]),
    };
    const spy = jest.spyOn(t.handle.quests, "state").mockReturnValue(pending);
    t.handle.talk = () => {
      answer(t.handle, "dialog", { dialog: greetDialog(16_703, 1) });
      setTimeout(() => {
        spy.mockReturnValue(known);
        t.handle.triggerAreaEvent("quests", {
          status: "known",
          textId: 16_703,
          type: "npc_text",
        });
      }, 100);
    };
    const run = interactSpec.run(
      { npc: "Velan Brightoak" },
      toolCtx<InteractAfter>(t),
    );
    const settled = run.then((done) => done);
    await withFakeTimers(() => elapse(ANSWER_MS)).catch(() => undefined);
    const res = await settled;
    expect(res.detail).toContain("Testchar, ready.");
  });

  test("gossip with a POI marks the point and names the travel", async () => {
    const { t } = await velan();
    selfBloodElf(t);
    moveTo(t.handle, { x: -9481, y: 74 });
    const state: QuestsAreaState = {
      completed: undefined,
      gossipPoi: { ...POI, at: 2, from: VELAN },
      marks: new Map(),
      pois: new Map(),
      texts: new Map(),
    };
    spyQuests(t, state);
    t.handle.talk = () =>
      answer(t.handle, "dialog", { dialog: gossipWithPoi(16_703) });
    t.handle.selectGossipOption = () => {
      answer(t.handle, "dialog", { dialog: greetDialog(16_703, 1) });
      t.handle.triggerAreaEvent("quests", {
        from: VELAN,
        name: POI.name,
        type: "gossip_poi",
      });
    };
    const res = await interactSpec.run(
      { do: "gossip", npc: "Velan Brightoak", what: "3" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.detail).toContain("Lion's Pride Inn");
    expect(res.next).toBe('travel(to: "-9459, 42.1")');
  });

  test("gossip does not mark a POI from an earlier option", async () => {
    const { t } = await velan();
    selfBloodElf(t);
    moveTo(t.handle, { x: -9481, y: 74 });
    const state: QuestsAreaState = {
      completed: undefined,
      gossipPoi: { ...POI, at: 2, from: VELAN },
      marks: new Map(),
      pois: new Map(),
      texts: new Map(),
    };
    spyQuests(t, state);
    t.handle.talk = () =>
      answer(t.handle, "dialog", { dialog: gossipWithPoi(16_703) });
    t.handle.selectGossipOption = () =>
      answer(t.handle, "dialog", { dialog: greetDialog(16_703, 1) });
    const res = await interactSpec.run(
      { do: "gossip", npc: "Velan Brightoak", what: "3" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.detail).not.toContain("Lion's Pride Inn");
    expect(res.next).toBeUndefined();
  });
});
