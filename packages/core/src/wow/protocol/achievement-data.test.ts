import { describe, expect, test } from "bun:test";
import { achievementsAllAchievementDataBody } from "#test-support/areas/achievements";
import { packTime } from "#test-support/areas/time";
import { parseAchievementData } from "#wow/protocol/achievement-data";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

const ME = 0x2an;
const MAY_DAY = {
  year: 2026,
  month: 5,
  day: 1,
  weekday: 5,
  hour: 12,
  minute: 30,
};
const NEW_YEAR = {
  year: 2027,
  month: 1,
  day: 1,
  weekday: 5,
  hour: 0,
  minute: 5,
};

function read(body: Uint8Array) {
  return parseAchievementData(new PacketReader(body));
}

describe("parseAchievementData", () => {
  test("reads the completed list and the criteria list of BuildAllDataPacket", () => {
    const body = achievementsAllAchievementDataBody({
      criteria: [
        {
          counter: 7n,
          elapsed: 3600,
          guid: ME,
          id: 111,
          packedTime: packTime(NEW_YEAR),
        },
      ],
      done: [
        { id: 6, packedTime: packTime(MAY_DAY) },
        { id: 7, packedTime: packTime(NEW_YEAR) },
      ],
    });
    expect(read(body)).toEqual({
      criteria: [{ at: NEW_YEAR, counter: 7n, id: 111 }],
      done: [
        { at: MAY_DAY, id: 6 },
        { at: NEW_YEAR, id: 7 },
      ],
    });
  });

  test("two end markers alone give empty lists", () => {
    expect(
      read(achievementsAllAchievementDataBody({ criteria: [], done: [] })),
    ).toEqual({ criteria: [], done: [] });
  });

  test("a counter above 2^32 stays exact", () => {
    const counter = 0x1_23_45_67_89n;
    const body = achievementsAllAchievementDataBody({
      criteria: [{ counter, guid: ME, id: 4, packedTime: packTime(MAY_DAY) }],
      done: [],
    });
    expect(read(body).criteria[0]?.counter).toBe(counter);
  });

  test("reads from the reader's position and stops after the second marker", () => {
    const w = new PacketWriter();
    w.packedGuidBig(ME);
    w.rawBytes(
      achievementsAllAchievementDataBody({
        criteria: [],
        done: [{ id: 6, packedTime: packTime(MAY_DAY) }],
      }),
    );
    w.uint8(0xaa);
    const reader = new PacketReader(w.finish());
    expect(reader.packedGuidBig()).toBe(ME);
    expect(parseAchievementData(reader).done).toEqual([{ at: MAY_DAY, id: 6 }]);
    expect(reader.remaining).toBe(1);
  });
});
