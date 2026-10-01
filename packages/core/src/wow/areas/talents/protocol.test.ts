import { describe, expect, test } from "bun:test";
import {
  talentsTalentsInfoBody,
  talentsTalentsInfoPetBody,
  talentsWipeOfferBody,
} from "#test-support/areas/talents";
import {
  buildLearnPreviewTalents,
  buildLearnTalent,
  buildTalentWipeConfirm,
  parseTalentsInfo,
  parseTalentWipeOffer,
} from "#wow/areas/talents/protocol";
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

function words(body: Uint8Array): number[] {
  const r = new PacketReader(body);
  const out: number[] = [];
  while (r.remaining > 0) out.push(r.uint32LE());
  return out;
}

describe("learn builders", () => {
  test("a learn is talent id then wire rank, two u32 (SkillHandler.cpp:25-32)", () => {
    expect(words(buildLearnTalent({ rank: 1, talentId: 124 }))).toEqual([
      124, 1,
    ]);
  });

  test("a preview batch is a count then id and rank pairs in the given order (SkillHandler.cpp:34-56)", () => {
    const body = buildLearnPreviewTalents([
      { rank: 2, talentId: 124 },
      { rank: 0, talentId: 130 },
    ]);
    expect(words(body)).toEqual([2, 124, 2, 130, 0]);
  });

  test("150 entries are sent and 151 throw because the server drops the rest (SkillHandler.cpp:44-47)", () => {
    const entry = { rank: 0, talentId: 1 };
    expect(
      words(buildLearnPreviewTalents(new Array(150).fill(entry))),
    ).toHaveLength(301);
    expect(() => buildLearnPreviewTalents(new Array(151).fill(entry))).toThrow(
      "too_many_talents",
    );
  });
});

describe("talent wipe confirm", () => {
  const TRAINER = 0xf1_30_00_11_d1_00_00_2an;

  test("an offer is the trainer guid then the copper cost (Player.cpp:9125-9132)", () => {
    const r = new PacketReader(
      talentsWipeOfferBody({ cost: 10_000, npcGuid: TRAINER }),
    );
    expect(parseTalentWipeOffer(r)).toEqual({ cost: 10_000, npcGuid: TRAINER });
    expect(r.remaining).toBe(0);
  });

  test("the no-talents reply has guid 0 and cost 0 (SkillHandler.cpp:78-84)", () => {
    expect(
      parseTalentWipeOffer(
        new PacketReader(talentsWipeOfferBody({ cost: 0, npcGuid: 0n })),
      ),
    ).toEqual({ cost: 0, npcGuid: 0n });
  });

  test("a truncated offer throws instead of reading short", () => {
    expect(() =>
      parseTalentWipeOffer(new PacketReader(new Uint8Array(8))),
    ).toThrow();
  });

  test("the confirm is the trainer guid alone (SkillHandler.cpp:58-63)", () => {
    const body = buildTalentWipeConfirm(TRAINER);
    const r = new PacketReader(body);
    expect(r.uint64LE()).toBe(TRAINER);
    expect(r.remaining).toBe(0);
  });
});
