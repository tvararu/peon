import { describe, expect, test } from "bun:test";
import {
  inspectInspectTalentBody,
  inspectRespondInspectAchievementsBody,
} from "#test-support/areas/inspect";
import { packTime } from "#test-support/areas/time";
import {
  buildInspect,
  buildQueryInspectAchievements,
  parseInspectTalent,
  parseRespondInspectAchievements,
  spentPoints,
} from "#wow/areas/inspect/protocol";
import { PacketReader } from "#wow/protocol/packet";

const GUID = 0x49_13n;

const NOON = {
  year: 2026,
  month: 9,
  day: 28,
  weekday: 1,
  hour: 12,
  minute: 0,
};

describe("inspect parsers", () => {
  test("buildInspect is a raw u64 (MiscHandler.cpp:977)", () => {
    const reader = new PacketReader(buildInspect(GUID));
    expect(reader.uint64LE()).toBe(GUID);
  });

  test("buildQueryInspectAchievements is a packed guid (MiscHandler.cpp:1590)", () => {
    const reader = new PacketReader(buildQueryInspectAchievements(GUID));
    expect(reader.packedGuidBig()).toBe(GUID);
  });

  test("one-spec reply reads free points, the spec and per-spec glyphs (Player.cpp:14734)", () => {
    const body = inspectInspectTalentBody({
      gear: [],
      guid: GUID,
      talents: {
        activeSpec: 0,
        freePoints: 3,
        specs: [
          {
            glyphs: [11, 12, 13, 14, 15, 16],
            talents: [
              { rank: 0, talentId: 0x7_6a },
              { rank: 2, talentId: 0x7_6b },
            ],
          },
        ],
      },
    });
    expect(parseInspectTalent(new PacketReader(body))).toEqual({
      freePoints: 3,
      gear: [],
      guid: GUID,
      specs: [
        {
          active: true,
          glyphs: [11, 12, 13, 14, 15, 16],
          index: 0,
          talents: [
            { rank: 0, talentId: 0x7_6a },
            { rank: 2, talentId: 0x7_6b },
          ],
        },
      ],
      short: false,
    });
  });

  test("each spec keeps its own glyphs and rank sums skip the wire offset (Player.cpp:14756)", () => {
    const body = inspectInspectTalentBody({
      gear: [],
      guid: GUID,
      talents: {
        activeSpec: 1,
        freePoints: 0,
        specs: [
          { glyphs: [1, 2, 3, 4, 5, 6], talents: [{ rank: 0, talentId: 9 }] },
          { glyphs: [7, 8, 9, 10, 11, 12], talents: [] },
        ],
      },
    });
    const parsed = parseInspectTalent(new PacketReader(body));
    expect(parsed.specs.map((spec) => spec.glyphs[0])).toEqual([1, 7]);
    expect(parsed.specs.map((spec) => spentPoints(spec))).toEqual([1, 0]);
    expect(parsed.specs.map((spec) => spec.active)).toEqual([false, true]);
  });

  test("short form is three zeros when TalentsInspecting is off (MiscHandler.cpp:1003)", () => {
    const body = inspectInspectTalentBody({
      gear: [],
      guid: GUID,
      short: true,
    });
    expect(parseInspectTalent(new PacketReader(body))).toEqual({
      freePoints: 0,
      gear: [],
      guid: GUID,
      short: true,
      specs: [],
    });
  });

  test("main hand gear reads entry, enchant, random property and creator (Player.cpp:14861)", () => {
    const body = inspectInspectTalentBody({
      gear: [
        {
          creator: 0x49_14n,
          enchants: { 0: 0xbe_ef },
          entry: 0x12_34,
          randomProperty: -7,
          slot: 15,
          suffixFactor: 42,
        },
      ],
      guid: GUID,
      short: true,
    });
    expect(parseInspectTalent(new PacketReader(body)).gear).toEqual([
      {
        creator: 0x49_14n,
        enchants: [{ id: 0xbe_ef, slot: 0 }],
        entry: 0x12_34,
        randomProperty: -7,
        slot: 15,
        suffixFactor: 42,
      },
    ]);
  });

  test("respond inspect achievements reuses the all-data body (AchievementMgr.cpp:2407)", () => {
    const packed = packTime(NOON);
    const body = inspectRespondInspectAchievementsBody({
      criteria: [{ counter: 4n, guid: GUID, id: 0x1c_37, packedTime: packed }],
      done: [{ id: 6, packedTime: packed }],
      guid: GUID,
    });
    const parsed = parseRespondInspectAchievements(new PacketReader(body));
    expect(parsed.guid).toBe(GUID);
    expect(parsed.done.map((entry) => entry.id)).toEqual([6]);
    expect(parsed.criteria.map((entry) => entry.id)).toEqual([0x1c_37]);
    expect(parsed.criteria[0]?.counter).toBe(4n);
  });

  test("a short body throws", () => {
    const body = inspectInspectTalentBody({
      gear: [],
      guid: GUID,
      short: true,
    });
    expect(() =>
      parseInspectTalent(new PacketReader(body.subarray(0, 2))),
    ).toThrow();
  });
});
