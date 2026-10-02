import { describe, expect, test } from "bun:test";
import { readTitles } from "#wow/areas/achievements/titles";
import { PLAYER_FIELDS } from "#wow/protocol/update-fields";

const KNOWN_BASE = PLAYER_FIELDS.KNOWN_TITLES.offset;
const CHOSEN = PLAYER_FIELDS.CHOSEN_TITLE.offset;

function fields(words: readonly number[], chosen: number): Map<number, number> {
  const raw = new Map<number, number>();
  for (const [index, word] of words.entries())
    raw.set(KNOWN_BASE + index, word);
  raw.set(CHOSEN, chosen);
  return raw;
}

describe("readTitles", () => {
  test("decodes the six known-title words into bit indexes", () => {
    const { chosen, known } = readTitles(
      fields([1, 2, 0, 4, 0, 0x80_00_00_00], 110),
    );
    expect(known).toEqual([0, 33, 98, 191]);
    expect(chosen).toBe(110);
  });

  test("an empty mask means no known titles and no chosen title", () => {
    expect(readTitles(new Map())).toEqual({ chosen: 0, known: [] });
  });

  test("bit 191 is inside the range", () => {
    const { known } = readTitles(fields([0, 0, 0, 0, 0, 0x80_00_00_00], 0));
    expect(known).toEqual([191]);
  });
});
