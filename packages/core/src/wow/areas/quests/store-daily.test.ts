import { describe, expect, test } from "bun:test";
import { receiveDaily, sameDaily } from "#wow/areas/quests/store-daily";

function fields(ids: readonly number[]): Map<number, number> {
  const map = new Map<number, number>();
  for (let i = 0; i < ids.length; i++) map.set(1280 + i, ids[i] ?? 0);
  return map;
}

describe("quests daily store", () => {
  test("ids at offsets 1280-1304 become the set, zeros are empty slots", () => {
    expect(receiveDaily(fields([14_179, 0, 11_545]))).toEqual(
      new Set([14_179, 11_545]),
    );
  });

  test("duplicate ids collapse and out-of-range offsets are ignored", () => {
    const map = fields([14_179, 14_179]);
    map.set(1279, 99);
    map.set(1305, 98);
    expect(receiveDaily(map)).toEqual(new Set([14_179]));
  });

  test("equal sets in any order match, a reset to empty does not", () => {
    expect(sameDaily(new Set([1, 2]), new Set([2, 1]))).toBe(true);
    expect(sameDaily(new Set([1]), new Set([2]))).toBe(false);
    expect(sameDaily(new Set([1]), new Set())).toBe(false);
  });
});
