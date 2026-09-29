import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  questsQuestgiverQuestDetailsBody,
  questsQuestPushResultBody,
} from "#test-support/areas/quests";
import type { AreaPort } from "#wow/areas/port";
import { QuestShareResult } from "#wow/areas/quests/protocol";
import {
  OFFER_TIMEOUT_MS,
  PUSH_TIMEOUT_MS,
} from "#wow/areas/quests/runtime-share";
import type { QuestsEvent } from "#wow/areas/quests/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

const SHARER = 0x2bn;
const ALICE = 0x30n;
const BOB = 0x31n;
const ME = 0x2an;
const QUEST = 8326;

function member(guid: bigint) {
  return {
    guid,
    health: null,
    level: null,
    maxHealth: null,
    name: `P${guid}`,
    online: true,
    source: null,
    statsAt: null,
  };
}

function legacy(
  inGroup: boolean,
  guids: readonly bigint[],
): AreaPort["legacy"] {
  return {
    channels: () => [],
    friends: () => [],
    guild: () => undefined,
    ignored: () => [],
    party: () => ({
      inGroup,
      leader: null,
      loot: null,
      members: guids.map(member),
    }),
  };
}

type Setup = { group?: boolean; log?: readonly number[] };

function setup({ group = true, log = [QUEST] }: Setup = {}) {
  const rig = areaRig("quests", {
    legacy: legacy(group, [ALICE, BOB]),
    selfGuid: ME,
  });
  const state = rig.stores.quests.state();
  const snapshot = jest.spyOn(rig.stores.quests, "snapshot");
  const withLog = (ids: readonly number[], pending?: object) =>
    snapshot.mockReturnValue({
      ...state,
      log: {
        complete: true,
        slots: ids.map((questId, slot) => ({
          counters: [0, 0, 0, 0],
          expiresAtSeconds: 0,
          flags: 0,
          questId,
          slot,
        })),
      },
      ...(pending ? { pending: pending as never } : {}),
    });
  withLog(log);
  const seen: QuestsEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  const shares = () =>
    seen.flatMap((event) => (event.type === "share" ? [event.share] : []));
  const sent = (opcode: number) => rig.sent.filter((p) => p.opcode === opcode);
  const result = (guid: bigint, code: number) =>
    rig.inject(
      GameOpcode.MSG_QUEST_PUSH_RESULT,
      questsQuestPushResultBody(guid, code),
    );
  const details = (divider: bigint, questId = QUEST) =>
    rig.inject(
      GameOpcode.SMSG_QUESTGIVER_QUEST_DETAILS,
      questsQuestgiverQuestDetailsBody({
        divider,
        guid: ME,
        questId,
        title: "Shared",
      }),
    );
  return { details, rig, result, seen, sent, shares, withLog };
}

function withRig(run: (r: ReturnType<typeof setup>) => void, init?: Setup) {
  jest.useFakeTimers();
  const r = setup(init);
  try {
    run(r);
  } finally {
    r.rig.dispose();
    jest.useRealTimers();
  }
}

describe("quest sharing, sharer", () => {
  test("refuses a quest that is not in the log, an empty slot, and a missing group, sending nothing", () => {
    withRig(
      ({ rig, sent }) => {
        expect(rig.handle.act.shareQuest(1234)).toEqual({
          ok: false,
          reason: "not_in_log",
        });
        expect(rig.handle.act.shareQuest(0)).toEqual({
          ok: false,
          reason: "not_in_log",
        });
        expect(sent(GameOpcode.CMSG_PUSHQUESTTOPARTY)).toEqual([]);
      },
      { log: [0, QUEST] },
    );
    withRig(
      ({ rig, sent }) => {
        expect(rig.handle.act.shareQuest(QUEST)).toEqual({
          ok: false,
          reason: "not_in_group",
        });
        expect(sent(GameOpcode.CMSG_PUSHQUESTTOPARTY)).toEqual([]);
      },
      { group: false },
    );
  });

  test("sends the push with the quest id and records it as waiting", () => {
    withRig(({ rig, sent, shares }) => {
      expect(rig.handle.act.shareQuest(QUEST)).toEqual({ ok: true });
      const [packet] = sent(GameOpcode.CMSG_PUSHQUESTTOPARTY);
      expect(
        new PacketReader(packet?.body ?? new Uint8Array()).uint32LE(),
      ).toBe(QUEST);
      expect(rig.handle.state().share?.push).toMatchObject({
        questId: QUEST,
        results: [],
        status: "waiting",
      });
      expect(shares()).toEqual([{ questId: QUEST, type: "pushed" }]);
    });
  });

  test("refuses a second push while one waits, and allows one after a result", () => {
    withRig(({ rig, result, sent }) => {
      rig.handle.act.shareQuest(QUEST);
      expect(rig.handle.act.shareQuest(QUEST)).toEqual({
        ok: false,
        reason: "in_flight",
      });
      result(ALICE, QuestShareResult.HAVE_QUEST);
      expect(rig.handle.act.shareQuest(QUEST)).toEqual({ ok: true });
      expect(sent(GameOpcode.CMSG_PUSHQUESTTOPARTY)).toHaveLength(2);
    });
  });

  test("a member that only sent result 0 does not block the next push, and its late reply belongs to the first push", () => {
    const OTHER = 8325;
    withRig(
      ({ rig, result, shares, sent }) => {
        rig.handle.act.shareQuest(QUEST);
        result(ALICE, QuestShareResult.SHARING_QUEST);
        result(BOB, QuestShareResult.SHARING_QUEST);
        expect(rig.handle.act.shareQuest(OTHER)).toEqual({ ok: true });
        expect(sent(GameOpcode.CMSG_PUSHQUESTTOPARTY)).toHaveLength(2);
        result(ALICE, QuestShareResult.DECLINE_QUEST);
        result(BOB, QuestShareResult.ACCEPT_QUEST);
        expect(shares().filter((s) => s.type === "relayed")).toEqual([
          {
            guid: ALICE,
            questId: QUEST,
            result: QuestShareResult.DECLINE_QUEST,
            type: "relayed",
          },
          {
            guid: BOB,
            questId: QUEST,
            result: QuestShareResult.ACCEPT_QUEST,
            type: "relayed",
          },
        ]);
        expect(rig.handle.state().share?.push).toMatchObject({
          questId: OTHER,
          results: [],
        });
      },
      { log: [QUEST, OTHER] },
    );
  });

  test("shares stay possible when a receiver never answers, such as an auto-complete quest", () => {
    const OTHER = 8325;
    withRig(
      ({ rig, result, sent }) => {
        rig.handle.act.shareQuest(QUEST);
        result(ALICE, QuestShareResult.SHARING_QUEST);
        jest.advanceTimersByTime(PUSH_TIMEOUT_MS * 10);
        expect(rig.handle.act.shareQuest(OTHER)).toEqual({ ok: true });
        result(ALICE, QuestShareResult.SHARING_QUEST);
        expect(rig.handle.state().share?.push).toMatchObject({
          questId: OTHER,
          status: "answered",
        });
        expect(sent(GameOpcode.CMSG_PUSHQUESTTOPARTY)).toHaveLength(2);
      },
      { log: [QUEST, OTHER] },
    );
  });

  test("a late reply goes to the newest push whose member is still awaiting", () => {
    const OTHER = 8325;
    withRig(
      ({ rig, result, shares }) => {
        rig.handle.act.shareQuest(QUEST);
        result(ALICE, QuestShareResult.SHARING_QUEST);
        rig.handle.act.shareQuest(OTHER);
        result(ALICE, QuestShareResult.SHARING_QUEST);
        rig.handle.act.shareQuest(QUEST);
        result(ALICE, QuestShareResult.DECLINE_QUEST);
        expect(shares().filter((s) => s.type === "relayed")).toEqual([
          {
            guid: ALICE,
            questId: OTHER,
            result: QuestShareResult.DECLINE_QUEST,
            type: "relayed",
          },
        ]);
        result(ALICE, QuestShareResult.ACCEPT_QUEST);
        expect(
          shares()
            .filter((s) => s.type === "relayed")
            .map((s) => s.questId),
        ).toEqual([OTHER, QUEST]);
      },
      { log: [QUEST, OTHER] },
    );
  });

  test("a delayed accept or decline is attributed to the push that reached the member", () => {
    const OTHER = 8325;
    withRig(
      ({ rig, result, shares, sent }) => {
        rig.handle.act.shareQuest(QUEST);
        result(ALICE, QuestShareResult.SHARING_QUEST);
        result(BOB, QuestShareResult.HAVE_QUEST);
        expect(rig.handle.act.shareQuest(OTHER)).toEqual({ ok: true });
        result(ALICE, QuestShareResult.DECLINE_QUEST);
        expect(shares().filter((s) => s.type === "relayed")).toEqual([
          {
            guid: ALICE,
            questId: QUEST,
            result: QuestShareResult.DECLINE_QUEST,
            type: "relayed",
          },
        ]);
        expect(rig.handle.state().share?.push?.questId).toBe(OTHER);
        expect(sent(GameOpcode.CMSG_PUSHQUESTTOPARTY)).toHaveLength(2);
      },
      { log: [QUEST, OTHER] },
    );
  });

  test("a reply after its push settled falls to the current push", () => {
    withRig(({ rig, result, shares }) => {
      rig.handle.act.shareQuest(QUEST);
      result(ALICE, QuestShareResult.HAVE_QUEST);
      rig.handle.act.shareQuest(QUEST);
      result(ALICE, QuestShareResult.DECLINE_QUEST);
      expect(shares().filter((s) => s.type === "relayed")).toEqual([
        {
          guid: ALICE,
          questId: QUEST,
          result: QuestShareResult.DECLINE_QUEST,
          type: "relayed",
        },
      ]);
      expect(rig.handle.state().share?.push?.results).toHaveLength(1);
    });
  });

  test("adds each member's result and does not report no_answer once one arrived", () => {
    withRig(({ rig, result, shares }) => {
      rig.handle.act.shareQuest(QUEST);
      result(ALICE, QuestShareResult.SHARING_QUEST);
      result(BOB, QuestShareResult.HAVE_QUEST);
      expect(
        rig.handle.state().share?.push?.results.map((r) => [r.guid, r.result]),
      ).toEqual([
        [ALICE, 0],
        [BOB, 6],
      ]);
      expect(rig.handle.state().share?.push?.status).toBe("answered");
      jest.advanceTimersByTime(PUSH_TIMEOUT_MS * 10);
      expect(shares().filter((s) => s.type === "expired")).toEqual([]);
      expect(shares().filter((s) => s.type === "result")).toEqual([
        { guid: ALICE, questId: QUEST, result: 0, type: "result" },
        { guid: BOB, questId: QUEST, result: 6, type: "result" },
      ]);
    });
  });

  test("a share the server drops silently becomes no_answer after 3 s and frees the next push", () => {
    withRig(({ rig, result, shares }) => {
      rig.handle.act.shareQuest(QUEST);
      jest.advanceTimersByTime(PUSH_TIMEOUT_MS - 1);
      expect(rig.handle.state().share?.push?.status).toBe("waiting");
      jest.advanceTimersByTime(1);
      expect(rig.handle.state().share?.push?.status).toBe("no_answer");
      expect(shares().at(-1)).toEqual({
        questId: QUEST,
        scope: "push",
        type: "expired",
      });
      result(ALICE, QuestShareResult.SHARING_QUEST);
      expect(rig.handle.state().share?.push?.results).toHaveLength(1);
      result(ALICE, QuestShareResult.DECLINE_QUEST);
      expect(rig.handle.act.shareQuest(QUEST)).toEqual({ ok: true });
    });
  });

  test("results 2 and 3 arrive later as relayed, and the sharer's own result 8 is a plain result", () => {
    withRig(({ rig, result, shares }) => {
      rig.handle.act.shareQuest(QUEST);
      result(ME, QuestShareResult.CANT_BE_SHARED_TODAY);
      result(ALICE, QuestShareResult.DECLINE_QUEST);
      result(BOB, QuestShareResult.ACCEPT_QUEST);
      expect(shares().slice(1)).toEqual([
        { guid: ME, questId: QUEST, result: 8, type: "result" },
        { guid: ALICE, questId: QUEST, result: 3, type: "relayed" },
        { guid: BOB, questId: QUEST, result: 2, type: "relayed" },
      ]);
    });
  });

  test("a result with no push behind it is ignored", () => {
    withRig(({ rig, result, shares }) => {
      result(ALICE, QuestShareResult.DECLINE_QUEST);
      expect(rig.handle.state().share?.push).toBeUndefined();
      expect(shares()).toEqual([]);
    });
  });

  test("dispose cancels the wait for a result", () => {
    withRig(({ rig, shares }) => {
      rig.handle.act.shareQuest(QUEST);
      rig.dispose();
      jest.advanceTimersByTime(PUSH_TIMEOUT_MS * 2);
      expect(shares().filter((s) => s.type === "expired")).toEqual([]);
    });
  });
});

describe("quest sharing, receiver", () => {
  const offered = (run: (r: ReturnType<typeof setup>) => void) =>
    withRig(run, { log: [] });
  const declined = (r: ReturnType<typeof setup>) =>
    r.sent(GameOpcode.MSG_QUEST_PUSH_RESULT);

  test("declining sends the 13-byte push result 3 to the sharer and closes the offer", () => {
    offered((r) => {
      r.details(SHARER);
      expect(r.rig.handle.act.answerShare("decline")).toBe(true);
      const [packet] = declined(r);
      expect(packet?.body).toHaveLength(13);
      const reader = new PacketReader(packet?.body ?? new Uint8Array());
      expect(reader.uint64LE()).toBe(SHARER);
      expect(reader.uint32LE()).toBe(QUEST);
      expect(reader.uint8()).toBe(QuestShareResult.DECLINE_QUEST);
      expect(r.rig.handle.state().share?.offer).toBeUndefined();
      expect(r.shares().at(-1)).toEqual({
        answer: "decline",
        questId: QUEST,
        type: "answered",
      });
      jest.advanceTimersByTime(OFFER_TIMEOUT_MS * 2);
      expect(declined(r)).toHaveLength(1);
    });
  });

  test("answering with no offer sends nothing", () => {
    offered((r) => {
      expect(r.rig.handle.act.answerShare("decline")).toBe(false);
      expect(declined(r)).toEqual([]);
    });
  });

  test("accepting is not built yet", () => {
    offered((r) => {
      r.details(SHARER);
      expect(() => r.rig.handle.act.answerShare("accept")).toThrow("not built");
      expect(r.rig.handle.state().share?.offer).toBeDefined();
    });
  });

  test("an offer nobody answers is declined at 60 s and expires, once", () => {
    offered((r) => {
      r.details(SHARER);
      jest.advanceTimersByTime(OFFER_TIMEOUT_MS - 1);
      expect(declined(r)).toEqual([]);
      jest.advanceTimersByTime(1);
      expect(declined(r)).toHaveLength(1);
      expect(r.shares().at(-1)).toEqual({
        questId: QUEST,
        scope: "offer",
        type: "expired",
      });
      expect(r.rig.handle.state().share?.offer).toBeUndefined();
      jest.advanceTimersByTime(OFFER_TIMEOUT_MS * 2);
      expect(declined(r)).toHaveLength(1);
    });
  });

  test("a new offer restarts the 60 s wait", () => {
    offered((r) => {
      r.details(SHARER, 1);
      jest.advanceTimersByTime(OFFER_TIMEOUT_MS - 1000);
      r.details(SHARER, 2);
      jest.advanceTimersByTime(OFFER_TIMEOUT_MS - 1);
      expect(declined(r)).toEqual([]);
      jest.advanceTimersByTime(1);
      expect(declined(r)).toHaveLength(1);
      const reader = new PacketReader(declined(r)[0]?.body ?? new Uint8Array());
      reader.uint64LE();
      expect(reader.uint32LE()).toBe(2);
    });
  });

  test("dispose cancels the offer's expiry", () => {
    offered((r) => {
      r.details(SHARER);
      r.rig.dispose();
      jest.advanceTimersByTime(OFFER_TIMEOUT_MS * 2);
      expect(declined(r)).toEqual([]);
    });
  });

  test("a gossip complete does not end the offer", () => {
    offered((r) => {
      r.details(SHARER);
      r.rig.inject(GameOpcode.SMSG_GOSSIP_COMPLETE, new Uint8Array());
      expect(r.rig.handle.state().share?.offer?.from).toBe(SHARER);
    });
  });

  test("an auto-accepted quest is never declined at expiry", () => {
    withRig(
      (r) => {
        r.details(SHARER);
        expect(r.shares()).toEqual([
          { answer: "auto_accepted", questId: QUEST, type: "answered" },
        ]);
        jest.advanceTimersByTime(OFFER_TIMEOUT_MS * 2);
        expect(declined(r)).toEqual([]);
        expect(r.rig.handle.act.answerShare("decline")).toBe(false);
      },
      { log: [QUEST] },
    );
  });
});
