import { describe, expect, test } from "bun:test";
import {
  questsQuestgiverStatusMultipleBody,
  questsQuestPoiQueryResponseBody,
} from "#test-support/areas/quests";
import {
  buildQuestgiverStatusQuery,
  buildQuestPoiQuery,
  parseQuestgiverStatusMultiple,
  parseQuestPoiResponse,
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
