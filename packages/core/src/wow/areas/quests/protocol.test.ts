import { describe, expect, test } from "bun:test";
import { questsQuestgiverStatusMultipleBody } from "#test-support/areas/quests";
import {
  buildQuestgiverStatusQuery,
  parseQuestgiverStatusMultiple,
} from "#wow/areas/quests/protocol";
import { PacketReader } from "#wow/protocol/packet";

const ERONA = 0xf1_30_00_3f_d1_00_1a_2bn;
const CHEST = 0xf1_10_00_00_2c_00_00_07n;

describe("quests parsers", () => {
  test("SMSG_QUESTGIVER_STATUS_MULTIPLE reads every giver with its full guid (Player.cpp:7906-7952)", () => {
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
});
