import type {
  ItemLabel,
  QuestDialog,
  QuestEvent,
  QuestQuery,
  QuestState,
} from "@peon/core";
import { setSelf, setUnits, unitRow } from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

type KnownQuest = Extract<QuestQuery, { status: "known" }>["data"];

export const VELAN = 0x30n;
export const REWARD_LABELS: Record<number, ItemLabel> = {
  2046: { itemClass: 4, name: "Green Chain Boots", quality: 2, subclass: 3 },
  2047: { itemClass: 2, name: "Sunstrider Axe", quality: 2, subclass: 0 },
};
export const MCBRIDE = 0x31n;
export const NO_REWARDS = {
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
export const OFFERED = [
  { icon: 2, level: 9, questId: 9254, title: "The Wayward Apprentice" },
  {
    icon: 2,
    level: 10,
    questId: 8892,
    title: "Situation at Sunsail Anchorage",
  },
];

export function listDialog(
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

export function detailsDialog(
  questId: number,
  title: string,
  objectives = "",
): QuestDialog {
  return {
    data: {
      activateAccept: 1,
      autoAccept: false,
      details: "",
      dividerGuid: 0n,
      emotes: [],
      flags: 0,
      guid: VELAN,
      objectives,
      questId,
      rewards: NO_REWARDS,
      suggestedPlayers: 0,
      title,
      unknown: 0,
    },
    kind: "details",
  };
}

export function offerDialog(questId: number, title: string): QuestDialog {
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

export function requestDialog(
  questId: number,
  title: string,
  flags: number,
): QuestDialog {
  return {
    data: {
      closeOnCancel: 0,
      completionFlags: [flags, 4, 8, 16],
      emote: 0,
      flags: 0,
      guid: VELAN,
      items: [],
      questId,
      requestText: "",
      requiredMoney: 0,
      suggestedPlayers: 0,
      title,
      unknown: 0,
    },
    kind: "requestItems",
  };
}

export function talkQuery(questId: number, objectives: string): QuestQuery {
  const none = {
    count: 0,
    encodedNpcOrGoId: 0,
    itemDropId: 0,
    npcOrGoId: 0,
    unknownSourceCount: 0,
  };
  const data = {
    objectives,
    questId,
    requiredItems: [],
    targets: [none, none, none, none],
    title: "A Threat Within",
  } as unknown as KnownQuest;
  return { data, questId, receivedAt: 0, status: "known" };
}

export function answer(
  handle: MockHandle,
  type: QuestEvent["type"],
  patch: Partial<QuestState>,
  questId?: number,
): void {
  const state = { ...handle.getQuestState(), ...patch };
  handle.getQuestState = () => state;
  handle.triggerQuestEvent({ questId, source: "packet", state, type });
}

export async function velan(distance = 3) {
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
  t.handle.itemLabel = (entry) =>
    REWARD_LABELS[entry] ?? { name: null, quality: null };
  let cancelled = 0;
  t.handle.cancelInteraction = () => {
    cancelled += 1;
  };
  return { cancels: () => cancelled, t };
}
