import { describe, expect, test } from "bun:test";
import type {
  QuestEvent,
  QuestState,
  RewardsEvent,
  RewardsState,
  VendorEvent,
  VendorRequest,
} from "@peon/core";
import { vendorDrafts } from "#harness/events/rules-world";
import {
  MONEY_NOTICE_MS,
  questDrafts,
  rewardsDrafts,
} from "#harness/events/rules-world-quest";
import { createMockGame } from "#test-support/mock-game";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

const handle = createMockGame();
const questBase = handle.getQuestState();
const rewardsBase: RewardsState = handle.getRewardsState();
const vendorBase = handle.getVendorState();

function vendorAsk(type: VendorEvent["type"], pending?: VendorRequest) {
  return { at: 0, state: { ...vendorBase, pending }, type };
}

const buying: VendorRequest = {
  action: "buy",
  answer: undefined,
  coinageBefore: 50_000,
  count: 1,
  guid: 0x10n,
  itemId: 159,
  maxPrice: 23,
  minPrice: 23,
  requestedAt: 0,
  slot: 1,
};

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

  test("a repeated progress count is one row", () => {
    const rc = testRuleInput();
    const kill = (currentCount: number, at: number) => ({
      at,
      data: {
        currentCount,
        encodedNpcOrGoId: 15_274,
        guid: 0x2an,
        npcOrGoId: 15_274,
        questId: 8325,
        requiredCount: 8,
      },
      kind: "kill" as const,
    });
    const rows = [kill(1, 10), kill(1, 11), kill(2, 20), kill(2, 21)].flatMap(
      (lastProgress) => questDrafts(quest("progress", { lastProgress }), rc),
    );
    expect(rows.map((row) => row.text)).toEqual([
      "quest 8325: 1/8.",
      "quest 8325: 2/8.",
    ]);
    questDrafts(quest("accepted"), rc);
    expect(
      questDrafts(quest("progress", { lastProgress: kill(1, 30) }), rc),
    ).toHaveLength(1);
  });

  test("names a quest from the dialog that offered it", () => {
    const rc = testRuleInput();
    const details = {
      data: { questId: 8325, title: "Reclaiming Sunstrider Isle" },
      kind: "details" as const,
    } as unknown as QuestState["dialog"];
    expect(questDrafts(quest("dialog", { dialog: details }), rc)).toEqual([]);
    expect(
      questDrafts(quest("accepted", { dialog: undefined }), rc)[0],
    ).toMatchObject({
      data: { questId: 8325, title: "Reclaiming Sunstrider Isle" },
      text: "Quest accepted: Reclaiming Sunstrider Isle (#8325).",
    });
    const list = {
      data: { quests: [{ questId: 783, title: "A Threat Within" }] },
      kind: "list" as const,
    } as unknown as QuestState["dialog"];
    questDrafts(
      { ...quest("dialog", { dialog: list }), questId: undefined },
      rc,
    );
    expect(
      questDrafts({ ...quest("completed"), questId: 783 }, rc)[0]?.text,
    ).toBe("Quest complete: A Threat Within (#783). Turn it in.");
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
    const rc = testRuleInput();
    expect(
      rewardsDrafts(rewards("loot_opened", { loot }), rc)[0],
    ).toMatchObject({
      class: "log",
      data: { guid: "2a", money: 12, slots: 0 },
      event: "loot/open",
    });
    const lastRelease = { guid: 0x2an, observedAt: 0, status: 1 };
    expect(
      rewardsDrafts(rewards("loot_release_observed", { lastRelease }), rc),
    ).toMatchObject([{ class: "log", event: "loot/release" }]);
  });

  test("a started group roll is a loot wake row", () => {
    const rc = testRuleInput({
      lookup: testLookup({ itemName: () => "Linen Cloth" }),
    });
    const started = {
      allowed: ["greed", "pass"] as ("greed" | "pass")[],
      choice: undefined,
      corpseGuid: 0x2an,
      count: 1,
      countdownMs: 60_000,
      expiresAt: 60_000,
      guid: 0x3bn,
      itemId: 20_797,
      mapId: 0,
      randomPropertyId: 0,
      randomSuffix: 0,
      remainingMs: 50_000,
      slot: 1,
      startedAt: 0,
      votes: [],
    };
    expect(
      rewardsDrafts(
        rewards("loot_roll_started", {
          rolls: { last: undefined, pending: [started] },
        }),
        rc,
      ),
    ).toMatchObject([{ class: "wake", event: "loot/roll" }]);
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

  test("money spent at a vendor names the vendor action", () => {
    const rc = testRuleInput();
    rewardsDrafts(rewards("inventory_observed", {}, 50_000), rc);
    vendorDrafts(vendorAsk("buy_requested", buying), rc);
    expect(
      rewardsDrafts(rewards("inventory_observed", {}, 49_977), rc)[0]?.data,
    ).toMatchObject({ delta: -23, reason: "vendor_buy" });
    vendorDrafts(vendorAsk("bought"), rc);
    expect(
      rewardsDrafts(rewards("inventory_observed", {}, 49_900), rc)[0]?.data,
    ).toMatchObject({ reason: "other" });
    vendorDrafts(vendorAsk("buy_requested", buying), rc);
    vendorDrafts(vendorAsk("bought"), rc);
    expect(
      rewardsDrafts(rewards("inventory_observed", {}, 49_877), rc)[0]?.data,
    ).toMatchObject({ reason: "vendor_buy" });
    vendorDrafts(vendorAsk("buy_requested", buying), rc);
    vendorDrafts(vendorAsk("bought"), rc);
    const late = { ...rc, now: rc.now + MONEY_NOTICE_MS };
    expect(
      rewardsDrafts(rewards("inventory_observed", {}, 49_854), late)[0]?.data,
    ).toMatchObject({ reason: "other" });
    rewardsDrafts(rewards("inventory_observed", {}, 49_900), rc);
    const selling: VendorRequest = {
      action: "sell",
      bag: 255,
      coinageBefore: 49_900,
      count: 1,
      guid: 0x10n,
      itemGuid: 0x40n,
      itemId: 4814,
      requestedAt: 0,
      slot: 23,
      stackBefore: 1,
    };
    vendorDrafts(vendorAsk("sell_requested", selling), rc);
    expect(
      rewardsDrafts(rewards("inventory_observed", {}, 49_950), rc)[0]?.data,
    ).toMatchObject({ reason: "vendor_sell" });
  });

  test("a release without a loot window still logs an empty open first", () => {
    const rc = testRuleInput();
    const lastRelease = { guid: 0x2an, observedAt: 0, status: 1 };
    const drafts = rewardsDrafts(
      rewards("loot_release_observed", { lastRelease }),
      rc,
    );
    expect(drafts.map((draft) => draft.event)).toEqual([
      "loot/open",
      "loot/release",
    ]);
    expect(drafts[0]).toMatchObject({
      class: "log",
      data: { empty: true, guid: "2a", money: 0, slots: 0 },
      text: "Loot window: nothing to loot.",
    });
    const loot = {
      guid: 0x2bn,
      invalidatedReason: undefined,
      items: [],
      lootType: 1,
      money: 3,
      openedAt: 0,
      phase: "open" as const,
    };
    rewardsDrafts(rewards("loot_opened", { loot }), rc);
    const again = { ...lastRelease, guid: 0x2bn };
    expect(
      rewardsDrafts(
        rewards("loot_release_observed", { lastRelease: again }),
        rc,
      ).map((draft) => draft.event),
    ).toEqual(["loot/release"]);
  });
});
