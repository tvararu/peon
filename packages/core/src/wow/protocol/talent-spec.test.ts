import { describe, expect, test } from "bun:test";
import { talentsSpecBlock } from "#test-support/areas/talents";
import { PacketReader } from "#wow/protocol/packet";
import { readTalentSpec } from "#wow/protocol/talent-spec";

describe("readTalentSpec", () => {
  test("an empty spec still carries six glyph slots (Player.cpp:14745-14765)", () => {
    const r = new PacketReader(talentsSpecBlock());
    expect(readTalentSpec(r)).toEqual({
      glyphs: [0, 0, 0, 0, 0, 0],
      talents: [],
    });
    expect(r.remaining).toBe(0);
  });

  test("a spec with two talents and one glyph keeps 0-based ranks", () => {
    const body = talentsSpecBlock({
      glyphs: [161, 0, 0, 0, 0, 0],
      talents: [
        { rank: 4, talentId: 1862 },
        { rank: 0, talentId: 1868 },
      ],
    });
    const r = new PacketReader(body);
    expect(readTalentSpec(r)).toEqual({
      glyphs: [161, 0, 0, 0, 0, 0],
      talents: [
        { rank: 4, talentId: 1862 },
        { rank: 0, talentId: 1868 },
      ],
    });
    expect(r.remaining).toBe(0);
  });

  test("reads exactly the glyph count on the wire and leaves the rest", () => {
    const body = new Uint8Array([
      ...talentsSpecBlock({ glyphs: [7, 9] }),
      0xaa,
    ]);
    const r = new PacketReader(body);
    expect(readTalentSpec(r)).toEqual({ glyphs: [7, 9], talents: [] });
    expect(r.remaining).toBe(1);
  });
});
