import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  questsQuestConfirmAcceptBody,
  questsQuestgiverQuestDetailsBody,
} from "#test-support/areas/quests";
import { partyMember, partyState } from "#test-support/party-fixtures";
import type { AreaPort } from "#wow/areas/port";
import { QuestShareResult } from "#wow/areas/quests/protocol";
import { OFFER_TIMEOUT_MS } from "#wow/areas/quests/runtime-share";
import type { QuestsEvent } from "#wow/areas/quests/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

const SHARER = 0x2bn;
const ALICE = 0x30n;
const BOB = 0x31n;
const ME = 0x2an;
const QUEST = 8326;

function member(guid: bigint) {
  return partyMember({ guid, name: `P${guid}` });
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
    party: () =>
      partyState({
        inGroup,
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
  return { details, rig, shares };
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

const offered = (
  run: (r: ReturnType<typeof setup>) => void,
  log: readonly number[] = [],
) => withRig(run, { log });
const declined = (r: ReturnType<typeof setup>) =>
  r.rig.sent.filter((p) => p.opcode === GameOpcode.MSG_QUEST_PUSH_RESULT);

describe("quest sharing, receiver", () => {
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

  test("accepting a shared offer sends the accept quest to the divider and answers", () => {
    offered((r) => {
      r.details(SHARER);
      expect(r.rig.handle.act.answerShare("accept")).toBe(true);
      const accepted = r.rig.sent.filter(
        (p) => p.opcode === GameOpcode.CMSG_QUESTGIVER_ACCEPT_QUEST,
      );
      expect(accepted).toHaveLength(1);
      const reader = new PacketReader(accepted[0]?.body ?? new Uint8Array());
      expect(reader.uint64LE()).toBe(SHARER);
      expect(reader.uint32LE()).toBe(QUEST);
      expect(r.rig.handle.state().share?.offer).toBeUndefined();
      expect(r.shares().at(-1)).toEqual({
        answer: "accept",
        questId: QUEST,
        type: "answered",
      });
      expect(declined(r)).toEqual([]);
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
});

describe("quest escort confirm, receiver", () => {
  const confirm = (r: ReturnType<typeof setup>) =>
    r.rig.inject(
      GameOpcode.SMSG_QUEST_CONFIRM_ACCEPT,
      questsQuestConfirmAcceptBody(8488, "Unexpected", SHARER),
    );
  const confirmed = (r: ReturnType<typeof setup>) =>
    r.rig.sent.filter((p) => p.opcode === GameOpcode.CMSG_QUEST_CONFIRM_ACCEPT);

  test("accepting the escort prompt sends the 4-byte confirm and answers", () => {
    offered((r) => {
      confirm(r);
      expect(r.rig.handle.act.answerShare("accept")).toBe(true);
      const [packet] = confirmed(r);
      expect(packet?.body).toEqual(new Uint8Array([0x28, 0x21, 0, 0]));
      expect(r.rig.handle.state().share?.offer).toBeUndefined();
      expect(r.shares().at(-1)).toEqual({
        answer: "accept",
        questId: 8488,
        type: "answered",
      });
    });
  });

  const pushResult = (r: ReturnType<typeof setup>) => {
    const [packet] = declined(r);
    if (packet === undefined) return;
    const reader = new PacketReader(packet.body);
    return {
      guid: reader.uint64LE(),
      questId: reader.uint32LE(),
      result: reader.uint8(),
    };
  };

  test("declining the escort prompt clears the divider with push result 3", () => {
    offered((r) => {
      confirm(r);
      expect(r.rig.handle.act.answerShare("decline")).toBe(true);
      expect(confirmed(r)).toEqual([]);
      expect(pushResult(r)).toEqual({
        guid: SHARER,
        questId: 8488,
        result: QuestShareResult.DECLINE_QUEST,
      });
    });
  });

  test("an unanswered escort prompt is declined at 60 s and expires", () => {
    offered((r) => {
      confirm(r);
      jest.advanceTimersByTime(OFFER_TIMEOUT_MS - 1);
      expect(declined(r)).toEqual([]);
      jest.advanceTimersByTime(1);
      expect(confirmed(r)).toEqual([]);
      expect(pushResult(r)).toEqual({
        guid: SHARER,
        questId: 8488,
        result: QuestShareResult.DECLINE_QUEST,
      });
      expect(r.rig.handle.state().share?.offer).toBeUndefined();
      expect(r.shares().at(-1)).toEqual({
        questId: 8488,
        scope: "offer",
        type: "expired",
      });
    });
  });
});

describe("quest sharing, receiver timers", () => {
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
