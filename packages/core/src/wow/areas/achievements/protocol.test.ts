import { describe, expect, test } from "bun:test";
import {
  achievementsAchievementDeletedBody,
  achievementsAchievementEarnedBody,
  achievementsCriteriaDeletedBody,
  achievementsCriteriaUpdateBody,
  achievementsServerFirstAchievementBody,
  achievementsTitleEarnedBody,
} from "#test-support/areas/achievements";
import { packTime } from "#test-support/areas/time";
import {
  buildSetTitle,
  parseAchievementDeleted,
  parseAchievementEarned,
  parseCriteriaDeleted,
  parseCriteriaUpdate,
  parseServerFirst,
  parseTitleEarned,
} from "#wow/areas/achievements/protocol";
import { PacketReader } from "#wow/protocol/packet";

const ME = 0x2an;
const OTHER = 0xdc5n;
const WHEN = {
  year: 2026,
  month: 9,
  day: 28,
  weekday: 1,
  hour: 6,
  minute: 15,
};

const reader = (body: Uint8Array) => new PacketReader(body);

describe("achievement packets", () => {
  test("SMSG_CRITERIA_UPDATE reads the criteria id, the packed counter and the time", () => {
    const body = achievementsCriteriaUpdateBody({
      counter: 0x1_00_00_00_05n,
      elapsed: 12,
      guid: ME,
      id: 5212,
      packedTime: packTime(WHEN),
    });
    expect(parseCriteriaUpdate(reader(body))).toEqual({
      at: WHEN,
      counter: 0x1_00_00_00_05n,
      id: 5212,
    });
  });

  test("SMSG_ACHIEVEMENT_EARNED reads the earner's guid, the id and the time", () => {
    for (const guid of [ME, OTHER]) {
      const body = achievementsAchievementEarnedBody({
        guid,
        id: 7,
        packedTime: packTime(WHEN),
      });
      expect(parseAchievementEarned(reader(body))).toEqual({
        at: WHEN,
        guid,
        id: 7,
      });
    }
  });

  test("SMSG_SERVER_FIRST_ACHIEVEMENT reads a u32 link in the guild form", () => {
    const body = achievementsServerFirstAchievementBody({
      guid: OTHER,
      id: 1400,
      link: 0,
      name: "Fac Guild",
    });
    expect(parseServerFirst(reader(body))).toEqual({
      guid: OTHER,
      id: 1400,
      link: 0,
      name: "Fac Guild",
    });
  });

  test("SMSG_SERVER_FIRST_ACHIEVEMENT reads a u32 link in the player form", () => {
    const body = achievementsServerFirstAchievementBody({
      guid: OTHER,
      id: 457,
      link: 1,
      name: "Firsty",
    });
    const r = reader(body);
    expect(parseServerFirst(r)).toEqual({
      guid: OTHER,
      id: 457,
      link: 1,
      name: "Firsty",
    });
    expect(r.remaining).toBe(0);
  });

  test("SMSG_CRITERIA_DELETED and SMSG_ACHIEVEMENT_DELETED read one id", () => {
    expect(
      parseCriteriaDeleted(reader(achievementsCriteriaDeletedBody(88))),
    ).toEqual({
      id: 88,
    });
    expect(
      parseAchievementDeleted(reader(achievementsAchievementDeletedBody(6))),
    ).toEqual({ id: 6 });
  });
  test("SMSG_TITLE_EARNED reads the bit index and the earned flag", () => {
    expect(
      parseTitleEarned(reader(achievementsTitleEarnedBody(110, 1))),
    ).toEqual({ bit: 110, earned: true });
    expect(
      parseTitleEarned(reader(achievementsTitleEarnedBody(110, 0))),
    ).toEqual({ bit: 110, earned: false });
  });

  test("CMSG_SET_TITLE writes an int32 bit or -1 to clear", () => {
    expect([...buildSetTitle(110)]).toEqual([110, 0, 0, 0]);
    expect([...buildSetTitle(undefined)]).toEqual([255, 255, 255, 255]);
  });
});
