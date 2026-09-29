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

  test("sends the push with the quest id and opens it for every group member", () => {
    withRig(({ rig, sent, shares }) => {
      expect(rig.handle.act.shareQuest(QUEST)).toEqual({ ok: true });
      const [packet] = sent(GameOpcode.CMSG_PUSHQUESTTOPARTY);
      expect(
        new PacketReader(packet?.body ?? new Uint8Array()).uint32LE(),
      ).toBe(QUEST);
      expect(rig.handle.state().share?.push).toMatchObject({
        expected: [ALICE, BOB],
        questId: QUEST,
        results: [],
        status: "open",
      });
      expect(shares()).toEqual([{ questId: QUEST, type: "pushed" }]);
    });
  });

  test("a second share while the push is open refuses busy and sends nothing, even after some results", () => {
    withRig(({ rig, result, sent }) => {
      rig.handle.act.shareQuest(QUEST);
      expect(rig.handle.act.shareQuest(QUEST)).toEqual({
        ok: false,
        reason: "busy",
      });
      result(ALICE, QuestShareResult.HAVE_QUEST);
      result(BOB, QuestShareResult.SHARING_QUEST);
      expect(rig.handle.act.shareQuest(QUEST)).toEqual({
        ok: false,
        reason: "busy",
      });
      expect(sent(GameOpcode.CMSG_PUSHQUESTTOPARTY)).toHaveLength(1);
    });
  });

  test("the push closes complete once every member has a final result, and then the next share goes out", () => {
    withRig(({ rig, result, shares, sent }) => {
      rig.handle.act.shareQuest(QUEST);
      result(ALICE, QuestShareResult.SHARING_QUEST);
      result(BOB, QuestShareResult.SHARING_QUEST);
      result(ALICE, QuestShareResult.DECLINE_QUEST);
      expect(rig.handle.state().share?.push?.status).toBe("open");
      result(BOB, QuestShareResult.ACCEPT_QUEST);
      expect(rig.handle.state().share?.push?.status).toBe("complete");
      expect(shares().at(-1)).toEqual({
        questId: QUEST,
        reason: "complete",
        type: "closed",
      });
      expect(rig.handle.act.shareQuest(QUEST)).toEqual({ ok: true });
      expect(sent(GameOpcode.CMSG_PUSHQUESTTOPARTY)).toHaveLength(2);
    });
  });

  test("refusal results are final answers", () => {
    withRig(({ rig, result }) => {
      rig.handle.act.shareQuest(QUEST);
      result(ALICE, QuestShareResult.BUSY);
      result(BOB, QuestShareResult.NOT_IN_PARTY);
      expect(rig.handle.state().share?.push?.status).toBe("complete");
    });
  });

  test("60 s after the push it closes as timed_out and frees the next share", () => {
    withRig(({ rig, result, shares }) => {
      rig.handle.act.shareQuest(QUEST);
      result(ALICE, QuestShareResult.SHARING_QUEST);
      jest.advanceTimersByTime(PUSH_TIMEOUT_MS - 1);
      expect(rig.handle.state().share?.push?.status).toBe("open");
      expect(rig.handle.act.shareQuest(QUEST)).toEqual({
        ok: false,
        reason: "busy",
      });
      jest.advanceTimersByTime(1);
      expect(rig.handle.state().share?.push?.status).toBe("timed_out");
      expect(shares().at(-1)).toEqual({
        questId: QUEST,
        reason: "timed_out",
        type: "closed",
      });
      expect(rig.handle.act.shareQuest(QUEST)).toEqual({ ok: true });
    });
  });

  test("PUSH_TIMEOUT_MS is 60 s", () => {
    expect(PUSH_TIMEOUT_MS).toBe(60_000);
  });

  test("a group change closes the open push and frees the next share", () => {
    const changes = [
      { type: "group_destroyed" as const },
      { type: "kicked" as const },
      {
        change: { added: [], formed: false, removed: ["Bob"] },
        leader: "Alice",
        loot: null,
        members: [],
        type: "group_list" as const,
      },
      {
        change: { added: ["Cy"], formed: false, removed: [] },
        leader: "Alice",
        loot: null,
        members: [],
        type: "group_list" as const,
      },
    ];
    for (const change of changes)
      withRig(({ rig, shares }) => {
        rig.handle.act.shareQuest(QUEST);
        rig.events.group.emit(change);
        expect(rig.handle.state().share?.push?.status).toBe("group_changed");
        expect(shares().at(-1)).toEqual({
          questId: QUEST,
          reason: "group_changed",
          type: "closed",
        });
        expect(rig.handle.act.shareQuest(QUEST)).toEqual({ ok: true });
      });
  });

  test("a group list that changes nobody, or a new leader, leaves the push open", () => {
    withRig(({ rig }) => {
      rig.handle.act.shareQuest(QUEST);
      rig.events.group.emit({
        change: { added: [], formed: false, removed: [] },
        leader: "Alice",
        loot: null,
        members: [],
        type: "group_list",
      });
      rig.events.group.emit({ name: "Bob", type: "leader_changed" });
      expect(rig.handle.state().share?.push?.status).toBe("open");
    });
  });

  test("an accept or decline that arrives after its push closed is dropped, counted, and never given to the next push", () => {
    const OTHER = 8325;
    withRig(
      ({ rig, result, shares }) => {
        rig.handle.act.shareQuest(QUEST);
        result(ALICE, QuestShareResult.SHARING_QUEST);
        jest.advanceTimersByTime(PUSH_TIMEOUT_MS);
        rig.handle.act.shareQuest(OTHER);
        result(ALICE, QuestShareResult.SHARING_QUEST);
        result(ALICE, QuestShareResult.DECLINE_QUEST);
        result(BOB, QuestShareResult.HAVE_QUEST);
        expect(shares().filter((s) => s.type === "relayed")).toEqual([
          {
            guid: ALICE,
            questId: OTHER,
            result: QuestShareResult.DECLINE_QUEST,
            type: "relayed",
          },
        ]);
        rig.handle.act.shareQuest(OTHER);
        jest.advanceTimersByTime(PUSH_TIMEOUT_MS);
        rig.handle.act.shareQuest(QUEST);
        const before = rig.handle.state().share;
        result(ALICE, QuestShareResult.ACCEPT_QUEST);
        expect(rig.handle.state().share?.push?.results).toEqual([]);
        expect(rig.handle.state().share?.dropped).toBe(
          (before?.dropped ?? 0) + 1,
        );
        expect(
          shares().filter((s) => s.type === "relayed" && s.questId === QUEST),
        ).toEqual([]);
      },
      { log: [QUEST, OTHER] },
    );
  });

  test("a stale relay in an open push is dropped when that member has no reply owed in it", () => {
    withRig(({ rig, result, shares }) => {
      rig.handle.act.shareQuest(QUEST);
      result(ALICE, QuestShareResult.DECLINE_QUEST);
      expect(rig.handle.state().share?.push?.results).toEqual([]);
      expect(rig.handle.state().share?.dropped).toBe(1);
      result(ALICE, QuestShareResult.SHARING_QUEST);
      result(ALICE, QuestShareResult.DECLINE_QUEST);
      result(ALICE, QuestShareResult.ACCEPT_QUEST);
      expect(shares().filter((s) => s.type === "relayed")).toHaveLength(1);
      expect(rig.handle.state().share?.dropped).toBe(2);
    });
  });

  test("a stale relay does not move the open push's 60 s timer", () => {
    withRig(({ rig, result }) => {
      rig.handle.act.shareQuest(QUEST);
      result(ALICE, QuestShareResult.SHARING_QUEST);
      jest.advanceTimersByTime(PUSH_TIMEOUT_MS);
      rig.handle.act.shareQuest(QUEST);
      jest.advanceTimersByTime(PUSH_TIMEOUT_MS - 1000);
      result(ALICE, QuestShareResult.DECLINE_QUEST);
      result(ALICE, QuestShareResult.SHARING_QUEST);
      jest.advanceTimersByTime(999);
      expect(rig.handle.state().share?.push?.status).toBe("open");
      jest.advanceTimersByTime(1);
      expect(rig.handle.state().share?.push?.status).toBe("timed_out");
    });
  });

  test("the open push's own results do not restart its timer", () => {
    withRig(({ rig, result }) => {
      rig.handle.act.shareQuest(QUEST);
      jest.advanceTimersByTime(PUSH_TIMEOUT_MS - 1000);
      result(ALICE, QuestShareResult.SHARING_QUEST);
      jest.advanceTimersByTime(1000);
      expect(rig.handle.state().share?.push?.status).toBe("timed_out");
    });
  });

  test("a push that closed complete has no timer left to fire", () => {
    withRig(({ rig, result, shares }) => {
      rig.handle.act.shareQuest(QUEST);
      result(ALICE, QuestShareResult.HAVE_QUEST);
      result(BOB, QuestShareResult.HAVE_QUEST);
      jest.advanceTimersByTime(PUSH_TIMEOUT_MS * 2);
      expect(shares().filter((s) => s.type === "closed")).toHaveLength(1);
      expect(rig.handle.state().share?.push?.status).toBe("complete");
    });
  });

  test("results 2 and 3 arrive later as relayed, and the sharer's own result 8 is a plain result", () => {
    withRig(({ rig, result, shares }) => {
      rig.handle.act.shareQuest(QUEST);
      result(ALICE, QuestShareResult.SHARING_QUEST);
      result(BOB, QuestShareResult.SHARING_QUEST);
      result(ME, QuestShareResult.CANT_BE_SHARED_TODAY);
      result(ALICE, QuestShareResult.DECLINE_QUEST);
      result(BOB, QuestShareResult.ACCEPT_QUEST);
      expect(shares().slice(3)).toEqual([
        { guid: ME, questId: QUEST, result: 8, type: "result" },
        { guid: ALICE, questId: QUEST, result: 3, type: "relayed" },
        { guid: BOB, questId: QUEST, result: 2, type: "relayed" },
        { questId: QUEST, reason: "complete", type: "closed" },
      ]);
    });
  });

  test("a result with no push behind it is dropped and counted", () => {
    withRig(({ rig, result, shares }) => {
      result(ALICE, QuestShareResult.DECLINE_QUEST);
      expect(rig.handle.state().share?.push).toBeUndefined();
      expect(rig.handle.state().share?.dropped).toBe(1);
      expect(shares()).toEqual([]);
    });
  });

  test("dispose cancels the push timer", () => {
    withRig(({ rig, shares }) => {
      rig.handle.act.shareQuest(QUEST);
      rig.dispose();
      jest.advanceTimersByTime(PUSH_TIMEOUT_MS * 2);
      expect(shares().filter((s) => s.type === "closed")).toEqual([]);
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
