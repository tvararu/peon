import { describe, expect, test } from "bun:test";
import type {
  QuestEvent,
  QuestState,
  RewardsEvent,
  RewardsState,
} from "@tuicraft/core";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import {
  MONEY_NOTICE_MS,
  questDrafts,
  rewardsDrafts,
} from "#harness/events/rules-world-quest";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

const handle = createMockHandle();
const questBase = handle.getQuestState();
const rewardsBase: RewardsState = handle.getRewardsState();

function quest(
  type: QuestEvent["type"],
  state: Partial<QuestState> = {},
): QuestEvent {
  return {
    questId: 8325,
    source: "packet",
    state: { ...questBase, ...state },
    type,
  };
}

function rewards(
  type: RewardsEvent["type"],
  state: Partial<RewardsState> = {},
  coinage?: number,
): RewardsEvent {
  const inventory = { ...rewardsBase.inventory, coinage };
  return { at: 0, state: { ...rewardsBase, inventory, ...state }, type };
}

const titled = testRuleInput({
  lookup: testLookup({ questTitle: () => "Unfortunate Measures" }),
});

describe("questDrafts", () => {
  test("accept, complete and reward are passive rows with the title", () => {
    expect(questDrafts(quest("accepted"), titled)).toEqual([
      {
        class: "passive",
        data: { questId: 8325, title: "Unfortunate Measures" },
        domain: "quest",
        event: "quest/accepted",
        text: "Quest accepted: Unfortunate Measures (#8325).",
      },
    ]);
    expect(questDrafts(quest("completed"), titled)[0]).toMatchObject({
      event: "quest/completed",
      text: "Quest complete: Unfortunate Measures (#8325). Turn it in.",
    });
    const lastReward = {
      arenaPoints: 0,
      at: 0,
      experience: 450,
      honor: 0,
      money: 75,
      questId: 8325,
      talents: 0,
    };
    expect(
      questDrafts(quest("rewarded", { lastReward }), titled)[0],
    ).toMatchObject({
      data: { money: 75, xp: 450 },
      event: "quest/rewarded",
      text: "Quest rewarded: Unfortunate Measures (+450 XP, 75 copper).",
    });
  });

  test("kill and collect progress carry counts", () => {
    const kill = {
      at: 0,
      data: {
        currentCount: 3,
        encodedNpcOrGoId: 15_366,
        guid: 0x2an,
        npcOrGoId: 15_366,
        questId: 8325,
        requiredCount: 8,
      },
      kind: "kill" as const,
    };
    expect(
      questDrafts(quest("progress", { lastProgress: kill }), titled)[0],
    ).toMatchObject({
      data: { count: 3, objective: 15_366, required: 8 },
      event: "quest/progress",
      text: "Unfortunate Measures: 3/8.",
    });
    expect(
      questDrafts(quest("progress", { lastProgress: undefined }), titled)[0]
        ?.text,
    ).toBe("Unfortunate Measures: progress.");
  });

  test("drops events without a quest id and other types", () => {
    expect(
      questDrafts({ ...quest("accepted"), questId: undefined }, titled),
    ).toEqual([]);
    expect(questDrafts(quest("dialog"), titled)).toEqual([]);
  });
});

describe("rewardsDrafts", () => {
  test("an own item push is a passive loot row", () => {
    const rc = testRuleInput({
      lookup: testLookup({ itemName: () => "Lynx Tooth" }),
    });
    const lastItemPush = {
      bagSlot: 255,
      count: 1,
      created: 0,
      guid: 1n,
      itemId: 20_797,
      observedAt: 0,
      randomPropertyId: 0,
      randomSuffix: 0,
      received: 0,
      showInChat: 1,
      slot: 23,
      totalCount: 4,
    };
    expect(rewardsDrafts(rewards("item_push", { lastItemPush }), rc)).toEqual([
      {
        class: "passive",
        data: {
          bag: 255,
          count: 1,
          itemId: 20_797,
          name: "Lynx Tooth",
          slot: 23,
          source: "loot",
          total: 4,
        },
        domain: "loot",
        event: "loot/item",
        text: "You receive Lynx Tooth x1.",
      },
    ]);
    expect(
      rewardsDrafts(
        rewards("item_push", { lastItemPush: { ...lastItemPush, guid: 9n } }),
        rc,
      ),
    ).toEqual([]);
  });

  test("loot open and release are log rows", () => {
    const loot = {
      guid: 0x2an,
      invalidatedReason: undefined,
      items: [],
      lootType: 1,
      money: 12,
      openedAt: 0,
      phase: "open" as const,
    };
    expect(
      rewardsDrafts(rewards("loot_opened", { loot }), testRuleInput())[0],
    ).toMatchObject({
      class: "log",
      data: { guid: "2a", money: 12, slots: 0 },
      event: "loot/open",
    });
    const lastRelease = { guid: 0x2an, observedAt: 0, status: 1 };
    expect(
      rewardsDrafts(
        rewards("loot_release_observed", { lastRelease }),
        testRuleInput(),
      )[0],
    ).toMatchObject({ class: "log", event: "loot/release" });
  });

  test("money changes come from coinage, with loot as the reason after a notice", () => {
    const rc = testRuleInput();
    expect(rewardsDrafts(rewards("inventory_observed", {}, 100), rc)).toEqual(
      [],
    );
    expect(rewardsDrafts(rewards("money_notice", {}, 100), rc)).toEqual([]);
    expect(rewardsDrafts(rewards("inventory_observed", {}, 112), rc)).toEqual([
      {
        class: "passive",
        data: { after: 112, before: 100, delta: 12, reason: "loot" },
        domain: "money",
        event: "money/change",
        text: "Money +12 copper (now 112).",
      },
    ]);
    const later = { ...rc, now: rc.now + MONEY_NOTICE_MS };
    expect(
      rewardsDrafts(rewards("inventory_observed", {}, 87), later)[0]?.data,
    ).toMatchObject({ delta: -25, reason: "other" });
  });
});
