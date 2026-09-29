import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  questsQuestgiverOfferRewardBody,
  questsQuestgiverQuestDetailsBody,
  questsQuestgiverRequestItemsBody,
} from "#test-support/areas/quests";
import type { AreaPort } from "#wow/areas/port";
import type { QuestsEvent } from "#wow/areas/quests/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x2an;
const SHARER = 0x2bn;
const STRANGER = 0x99n;
const QUEST = 8326;

const legacy: AreaPort["legacy"] = {
  channels: () => [],
  friends: () => [],
  guild: () => undefined,
  ignored: () => [],
  party: () => ({
    inGroup: true,
    leader: null,
    loot: null,
    members: [
      {
        guid: SHARER,
        health: null,
        level: null,
        maxHealth: null,
        name: "Sharer",
        online: true,
        source: null,
        statsAt: null,
      },
    ],
  }),
};

function setup(log: readonly number[] = [], pending?: object) {
  jest.useFakeTimers();
  const rig = areaRig("quests", { legacy, selfGuid: ME });
  const state = rig.stores.quests.state();
  jest.spyOn(rig.stores.quests, "snapshot").mockReturnValue({
    ...state,
    log: {
      complete: true,
      slots: log.map((questId, slot) => ({
        counters: [0, 0, 0, 0],
        expiresAtSeconds: 0,
        flags: 0,
        questId,
        slot,
      })),
    },
    ...(pending ? { pending: pending as never } : {}),
  });
  const seen: QuestsEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  const details = (divider: bigint) =>
    rig.inject(
      GameOpcode.SMSG_QUESTGIVER_QUEST_DETAILS,
      questsQuestgiverQuestDetailsBody({
        divider,
        guid: ME,
        questId: QUEST,
        title: "Shared",
      }),
    );
  const items = (guid: bigint) =>
    rig.inject(
      GameOpcode.SMSG_QUESTGIVER_REQUEST_ITEMS,
      questsQuestgiverRequestItemsBody(guid, QUEST),
    );
  const offer = (guid: bigint) =>
    rig.inject(
      GameOpcode.SMSG_QUESTGIVER_OFFER_REWARD,
      questsQuestgiverOfferRewardBody(guid, QUEST),
    );
  const shares = () =>
    seen.flatMap((event) => (event.type === "share" ? [event.share] : []));
  return { details, items, offer, rig, shares };
}

function within(
  run: (r: ReturnType<typeof setup>) => void,
  log?: readonly number[],
  pending?: object,
) {
  const r = setup(log, pending);
  try {
    run(r);
  } finally {
    r.rig.dispose();
    jest.useRealTimers();
  }
}

const INTENT = {
  action: "accept",
  guid: 1n,
  questId: QUEST,
  status: "unanswered",
};

describe("quest sharing offers", () => {
  test("a details packet with a divider and no pending intent opens an offer from the divider", () => {
    within(({ details, rig, shares }) => {
      details(SHARER);
      expect(rig.handle.state().share?.offer).toMatchObject({
        from: SHARER,
        questId: QUEST,
        title: "Shared",
      });
      expect(shares()).toEqual([
        { from: SHARER, questId: QUEST, title: "Shared", type: "offered" },
      ]);
    });
  });

  test("a details packet with no divider is a plain quest dialog, not an offer", () => {
    within(({ details, rig, shares }) => {
      details(0n);
      expect(rig.handle.state().share?.offer).toBeUndefined();
      expect(shares()).toEqual([]);
    });
  });

  test("a details packet answering our own pending intent is not an offer, even with a lingering divider", () => {
    within(
      ({ details, rig, shares }) => {
        details(SHARER);
        expect(rig.handle.state().share?.offer).toBeUndefined();
        expect(shares()).toEqual([]);
      },
      [],
      INTENT,
    );
  });

  test("a quest already in the log is reported as auto_accepted and opens no offer", () => {
    within(
      ({ details, rig, shares }) => {
        details(SHARER);
        expect(rig.handle.state().share?.offer).toBeUndefined();
        expect(shares()).toEqual([
          { answer: "auto_accepted", questId: QUEST, type: "answered" },
        ]);
      },
      [QUEST],
    );
  });

  test("a request-items packet from a group member is a share_complete notice with no offer", () => {
    within(({ items, rig, shares }) => {
      items(SHARER);
      expect(rig.handle.state().share?.offer).toBeUndefined();
      expect(shares()).toEqual([
        { from: SHARER, questId: QUEST, type: "share_complete" },
      ]);
    });
  });
  test("a request-items packet from a stranger, or with a pending intent, says nothing", () => {
    within(({ items, shares }) => {
      items(STRANGER);
      expect(shares()).toEqual([]);
    });
    within(
      ({ items, shares }) => {
        items(SHARER);
        expect(shares()).toEqual([]);
      },
      [],
      INTENT,
    );
  });

  test("an offer-reward packet from a group member is a share_complete notice", () => {
    within(({ offer, shares }) => {
      offer(SHARER);
      expect(shares()).toEqual([
        { from: SHARER, questId: QUEST, type: "share_complete" },
      ]);
    });
  });
  test("an offer-reward packet from a stranger, or with a pending intent, says nothing", () => {
    within(({ offer, shares }) => {
      offer(STRANGER);
      expect(shares()).toEqual([]);
    });
    within(
      ({ offer, shares }) => {
        offer(SHARER);
        expect(shares()).toEqual([]);
      },
      [],
      INTENT,
    );
  });
});
