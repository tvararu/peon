import { describe, expect, test } from "bun:test";

import {
  questsGossipPoiBody,
  questsNpcTextUpdateBody,
  questsQueryQuestsCompletedResponseBody,
  questsQuestConfirmAcceptBody,
  questsQuestgiverStatusMultipleBody,
  questsQuestPoiQueryResponseBody,
  questsQuestPushResultBody,
} from "#test-support/areas/quests";
import {
  buildNpcTextQuery,
  buildPushQuestToParty,
  buildQuestConfirmAccept,
  buildQuestgiverHello,
  buildQuestgiverStatusQuery,
  buildQuestLogSwapQuest,
  buildQuestPoiQuery,
  buildQuestPushResult,
  parseGossipPoi,
  parseNpcTextUpdate,
  parseQuestConfirmAccept,
  parseQuestgiverStatusMultiple,
  parseQuestPoiResponse,
  parseQuestPushResult,
  parseQuestsCompleted,
  QuestShareResult,
} from "#wow/areas/quests/protocol";
import { PacketReader } from "#wow/protocol/packet";

const ERONA = 0xf1_30_00_3f_d1_00_1a_2bn;
const CHEST = 0xf1_10_00_00_2c_00_00_07n;

describe("quests parsers", () => {
  test("SMSG_QUESTGIVER_STATUS_MULTIPLE reads every giver with its full guid (Player.cpp:7906-7951)", () => {
    const reader = new PacketReader(
      questsQuestgiverStatusMultipleBody([
        { guid: ERONA, status: 8 },
        { guid: CHEST, status: 10 },
      ]),
    );
    expect(parseQuestgiverStatusMultiple(reader)).toEqual([
      { guid: ERONA, status: 8 },
      { guid: CHEST, status: 10 },
    ]);
    expect(reader.remaining).toBe(0);
  });

  test("SMSG_QUESTGIVER_STATUS_MULTIPLE with a count of 0 gives no givers", () => {
    const reader = new PacketReader(questsQuestgiverStatusMultipleBody([]));
    expect(parseQuestgiverStatusMultiple(reader)).toEqual([]);
    expect(reader.remaining).toBe(0);
  });

  test("CMSG_QUESTGIVER_STATUS_QUERY is the 8-byte giver guid (QuestHandler.cpp:36-40)", () => {
    const body = buildQuestgiverStatusQuery(ERONA);
    expect(body).toHaveLength(8);
    expect(new PacketReader(body).uint64LE()).toBe(ERONA);
  });

  test("SMSG_QUEST_POI_QUERY_RESPONSE reads signed objective index and points (QueryHandler.cpp:452,462-463)", () => {
    const reader = new PacketReader(
      questsQuestPoiQueryResponseBody([
        {
          questId: 8325,
          pois: [
            {
              poiId: 0,
              objectiveIndex: -1,
              mapId: 530,
              areaId: 462,
              floorId: 0,
              unk3: 1,
              unk4: 0,
              points: [
                { x: 10_319, y: -6383 },
                { x: 10_385, y: -6316 },
              ],
            },
          ],
        },
      ]),
    );
    expect(parseQuestPoiResponse(reader)).toEqual([
      {
        questId: 8325,
        pois: [
          {
            poiId: 0,
            objectiveIndex: -1,
            mapId: 530,
            areaId: 462,
            floorId: 0,
            unk3: 1,
            unk4: 0,
            points: [
              { x: 10_319, y: -6383 },
              { x: 10_385, y: -6316 },
            ],
          },
        ],
      },
    ]);
    expect(reader.remaining).toBe(0);
  });

  test("SMSG_QUEST_POI_QUERY_RESPONSE answers a quest with no POIs in an empty list (QueryHandler.cpp:434-438,471-476)", () => {
    const reader = new PacketReader(
      questsQuestPoiQueryResponseBody([{ questId: 9999, pois: [] }]),
    );
    expect(parseQuestPoiResponse(reader)).toEqual([
      { questId: 9999, pois: [] },
    ]);
    expect(reader.remaining).toBe(0);
  });

  test("CMSG_QUEST_POI_QUERY writes u32 count and ids (QueryHandler.cpp:411-420)", () => {
    const body = buildQuestPoiQuery([8325]);
    const reader = new PacketReader(body);
    expect(reader.uint32LE()).toBe(1);
    expect(reader.uint32LE()).toBe(8325);
    expect(reader.remaining).toBe(0);
  });

  test("CMSG_QUEST_POI_QUERY drops duplicate ids and refuses more than 25", () => {
    const body = buildQuestPoiQuery([8325, 8325, 9999]);
    const reader = new PacketReader(body);
    expect(reader.uint32LE()).toBe(2);
    expect(reader.uint32LE()).toBe(8325);
    expect(reader.uint32LE()).toBe(9999);
    const many = Array.from({ length: 26 }, (_, i) => 8000 + i);
    expect(() => buildQuestPoiQuery(many)).toThrow(RangeError);
  });
});

const GUARD = 0xf1_30_00_05_8f_00_2b_11n;
const NO_EMOTES = [
  { delay: 0, emote: 0 },
  { delay: 0, emote: 0 },
  { delay: 0, emote: 0 },
];
const EMPTY_OPTION = {
  probability: 0,
  text0: "",
  text1: "",
  language: 0,
  emotes: NO_EMOTES,
};

describe("quests NPC text and gossip POI parsers", () => {
  test("SMSG_NPC_TEXT_UPDATE reads the id and exactly 8 options (QueryHandler.cpp:325-352)", () => {
    const greeting = {
      probability: 1,
      text0: "Welcome to Sunstrider Isle, $N.",
      text1: "Welcome to Sunstrider Isle, $N.",
      language: 7,
      emotes: [
        { delay: 0, emote: 1 },
        { delay: 500, emote: 2 },
        { delay: 0, emote: 0 },
      ],
    };
    const reader = new PacketReader(
      questsNpcTextUpdateBody(8281, [
        greeting,
        { ...EMPTY_OPTION, probability: 0.5, text0: "Hail, $C." },
      ]),
    );
    const text = parseNpcTextUpdate(reader);
    expect(reader.remaining).toBe(0);
    expect(text.textId).toBe(8281);
    expect(text.options).toHaveLength(8);
    expect(text.options[0]).toEqual(greeting);
    expect(text.options[1]).toEqual({
      ...EMPTY_OPTION,
      probability: 0.5,
      text0: "Hail, $C.",
      text1: "Hail, $C.",
    });
    expect(text.options[7]).toEqual(EMPTY_OPTION);
  });

  test("SMSG_NPC_TEXT_UPDATE for an unknown id is 8 zero-probability 'Greetings $N' options (QueryHandler.cpp:289-305)", () => {
    const reader = new PacketReader(questsNpcTextUpdateBody(999_999));
    const text = parseNpcTextUpdate(reader);
    expect(reader.remaining).toBe(0);
    expect(text.textId).toBe(999_999);
    expect(text.options).toEqual(
      Array.from({ length: 8 }, () => ({
        ...EMPTY_OPTION,
        text0: "Greetings $N",
        text1: "Greetings $N",
      })),
    );
  });

  test("SMSG_GOSSIP_POI reads flags, x, y, icon, importance and name (GossipDef.cpp:262-267)", () => {
    const poi = {
      flags: 99,
      x: -8867.5,
      y: 673.25,
      icon: 7,
      importance: 6,
      name: "The Gilded Rose",
    };
    const reader = new PacketReader(questsGossipPoiBody(poi));
    expect(parseGossipPoi(reader)).toEqual(poi);
    expect(reader.remaining).toBe(0);
  });

  test("CMSG_NPC_TEXT_QUERY is the u32 text id then the u64 guid (QueryHandler.cpp:279-283)", () => {
    const reader = new PacketReader(buildNpcTextQuery(8281, GUARD));
    expect(reader.uint32LE()).toBe(8281);
    expect(reader.uint64LE()).toBe(GUARD);
    expect(reader.remaining).toBe(0);
  });
});

describe("quests log extras", () => {
  test("SMSG_QUERY_QUESTS_COMPLETED_RESPONSE reads the rewarded quest ids (QuestHandler.cpp:627-636)", () => {
    const reader = new PacketReader(
      questsQueryQuestsCompletedResponseBody([8325, 8326, 9_999_999]),
    );
    expect(parseQuestsCompleted(reader)).toEqual(
      new Set([8325, 8326, 9_999_999]),
    );
    expect(reader.remaining).toBe(0);
  });

  test("SMSG_QUERY_QUESTS_COMPLETED_RESPONSE with a count of 0 gives no ids", () => {
    const reader = new PacketReader(questsQueryQuestsCompletedResponseBody([]));
    expect(parseQuestsCompleted(reader)).toEqual(new Set());
    expect(reader.remaining).toBe(0);
  });

  test("CMSG_QUESTGIVER_HELLO is the 8-byte giver guid (QuestHandler.cpp:79-83)", () => {
    const body = buildQuestgiverHello(ERONA);
    expect(body).toHaveLength(8);
    expect(new PacketReader(body).uint64LE()).toBe(ERONA);
  });

  test("CMSG_QUESTLOG_SWAP_QUEST is two uint8 slots (QuestPackets.cpp:107-111)", () => {
    expect(buildQuestLogSwapQuest(0, 24)).toEqual(new Uint8Array([0, 24]));
  });

  test("CMSG_QUESTLOG_SWAP_QUEST refuses slots the server ignores (QuestHandler.cpp:386-388)", () => {
    expect(buildQuestLogSwapQuest(3, 3)).toBeUndefined();
    expect(buildQuestLogSwapQuest(0, 25)).toBeUndefined();
    expect(buildQuestLogSwapQuest(25, 1)).toBeUndefined();
    expect(buildQuestLogSwapQuest(-1, 1)).toBeUndefined();
    expect(buildQuestLogSwapQuest(0.5, 1)).toBeUndefined();
  });
});

describe("quest sharing packets", () => {
  test("MSG_QUEST_PUSH_RESULT from the server is a guid and a uint8 result (QuestPackets.cpp:70-76)", () => {
    const body = questsQuestPushResultBody(ERONA, 4);
    expect(body).toHaveLength(9);
    expect(parseQuestPushResult(new PacketReader(body))).toEqual({
      guid: ERONA,
      result: QuestShareResult.BUSY,
    });
  });

  test("MSG_QUEST_PUSH_RESULT from the client is 13 bytes, guid then quest id then result (QuestPackets.cpp:98-105)", () => {
    const body = buildQuestPushResult(
      ERONA,
      8326,
      QuestShareResult.DECLINE_QUEST,
    );
    expect(body).toHaveLength(13);
    const reader = new PacketReader(body);
    expect(reader.uint64LE()).toBe(ERONA);
    expect(reader.uint32LE()).toBe(8326);
    expect(reader.uint8()).toBe(3);
  });

  test("CMSG_PUSHQUESTTOPARTY is the uint32 quest id (QuestPackets.cpp:123-126)", () => {
    expect(buildPushQuestToParty(8326)).toEqual(
      new Uint8Array([0x86, 0x20, 0, 0]),
    );
  });

  test("SMSG_QUEST_CONFIRM_ACCEPT is quest id, title and the accepting member guid (QuestPackets.cpp:61-68, PlayerQuest.cpp:2483-2503)", () => {
    const body = questsQuestConfirmAcceptBody(
      8488,
      "Unexpected Results",
      ERONA,
    );
    const confirm = parseQuestConfirmAccept(new PacketReader(body));
    expect(confirm.questId).toBe(8488);
    expect(confirm.title).toBe("Unexpected Results");
    expect(confirm.from).toBe(ERONA);
  });

  test("CMSG_QUEST_CONFIRM_ACCEPT is the uint32 quest id (QuestPackets.cpp:118-121)", () => {
    expect(buildQuestConfirmAccept(8488)).toEqual(
      new Uint8Array([0x28, 0x21, 0, 0]),
    );
  });

  test("the share results hold AzerothCore's values 0 to 10 (QuestDef.h:64-77)", () => {
    expect(Object.values(QuestShareResult).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(QuestShareResult.SHARING_QUEST).toBe(0);
    expect(QuestShareResult.ACCEPT_QUEST).toBe(2);
    expect(QuestShareResult.NOT_IN_PARTY).toBe(10);
  });
});
