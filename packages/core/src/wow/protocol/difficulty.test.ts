import { describe, expect, test } from "bun:test";
import {
  DUNGEON_DIFFICULTY,
  difficultyName,
  RAID_DIFFICULTY,
} from "#wow/protocol/difficulty";

describe("difficulty names (DBCEnums.h:267-282)", () => {
  test("dungeon 0-2 name normal, heroic and epic", () => {
    expect([0, 1, 2].map((v) => difficultyName("dungeon", v))).toEqual([
      "normal",
      "heroic",
      "epic",
    ]);
    expect(difficultyName("dungeon", DUNGEON_DIFFICULTY.heroic)).toBe("heroic");
  });

  test("raid 0-3 name the size and the mode", () => {
    expect([0, 1, 2, 3].map((v) => difficultyName("raid", v))).toEqual([
      "10-normal",
      "25-normal",
      "10-heroic",
      "25-heroic",
    ]);
    expect(difficultyName("raid", RAID_DIFFICULTY["25-heroic"])).toBe(
      "25-heroic",
    );
  });

  test("out-of-range values have no name", () => {
    expect(difficultyName("dungeon", 3)).toBeUndefined();
    expect(difficultyName("raid", 4)).toBeUndefined();
    expect(difficultyName("raid", -1)).toBeUndefined();
    expect(difficultyName("dungeon", 0xff_ff_ff_ff)).toBeUndefined();
  });
});
