import { describe, expect, test } from "bun:test";
import {
  talentsTalentsInfoBody,
  talentsTalentsInfoPetBody,
} from "#test-support/areas/talents";
import { parseTalentsInfo } from "#wow/areas/talents/protocol";
import { PacketReader } from "#wow/protocol/packet";

const NO_GLYPHS = [0, 0, 0, 0, 0, 0];

function parse(body: Uint8Array) {
  const r = new PacketReader(body);
  const info = parseTalentsInfo(r);
  return r.remaining === 0 ? info : { leftover: r.remaining };
}

describe("parseTalentsInfo", () => {
  test("a level-1 login is 0 points, one spec, no talents and six empty glyphs (Player.cpp:14734-14766)", () => {
    expect(
      parse(talentsTalentsInfoBody({ freePoints: 0, specs: [{}] })),
    ).toEqual({
      activeSpec: 0,
      freePoints: 0,
      kind: "player",
      specCount: 1,
      specs: [{ glyphs: NO_GLYPHS, talents: [] }],
    });
  });

  test("a level-12 character with three ranks in one tree", () => {
    const body = talentsTalentsInfoBody({
      freePoints: 0,
      specs: [
        {
          talents: [
            { rank: 1, talentId: 1862 },
            { rank: 0, talentId: 1868 },
          ],
        },
      ],
    });
    expect(parse(body)).toEqual({
      activeSpec: 0,
      freePoints: 0,
      kind: "player",
      specCount: 1,
      specs: [
        {
          glyphs: NO_GLYPHS,
          talents: [
            { rank: 1, talentId: 1862 },
            { rank: 0, talentId: 1868 },
          ],
        },
      ],
    });
  });

  test("a two-spec character with active spec 1 reads both blocks", () => {
    const body = talentsTalentsInfoBody({
      activeSpec: 1,
      freePoints: 5,
      specs: [
        { glyphs: [161, 0, 0, 0, 0, 0], talents: [{ rank: 4, talentId: 11 }] },
        { talents: [{ rank: 2, talentId: 22 }] },
      ],
    });
    expect(parse(body)).toEqual({
      activeSpec: 1,
      freePoints: 5,
      kind: "player",
      specCount: 2,
      specs: [
        { glyphs: [161, 0, 0, 0, 0, 0], talents: [{ rank: 4, talentId: 11 }] },
        { glyphs: NO_GLYPHS, talents: [{ rank: 2, talentId: 22 }] },
      ],
    });
  });

  test("the pet form with no pet is six bytes and no talents (Player.cpp:14770-14778)", () => {
    const body = talentsTalentsInfoPetBody();
    expect([...body]).toEqual([1, 0, 0, 0, 0, 0]);
    expect(parse(body)).toEqual({ freePoints: 0, kind: "pet", talents: [] });
  });

  test("the pet form with a pet lists its talents (Player.cpp:14780-14838)", () => {
    const body = talentsTalentsInfoPetBody({
      freePoints: 2,
      talents: [{ rank: 1, talentId: 2107 }],
    });
    expect(parse(body)).toEqual({
      freePoints: 2,
      kind: "pet",
      talents: [{ rank: 1, talentId: 2107 }],
    });
  });

  test("an unknown type byte throws", () => {
    expect(() =>
      parseTalentsInfo(new PacketReader(new Uint8Array([2, 0, 0, 0, 0]))),
    ).toThrow("unknown_talents_info_type");
  });
});
