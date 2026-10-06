import { describe, expect, test } from "bun:test";
import type { AreaEvent, AreaEventOf } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

function talents(event: AreaEventOf<"talents">): AreaEvent {
  return { area: "talents", event };
}

const EMPTY_INFO: AreaEventOf<"talents"> = {
  glyphs: [],
  pointsAfter: 0,
  pointsBefore: 0,
  specAfter: 0,
  specBefore: 0,
  talents: [],
  type: "info",
};

const atLevel = (level: number | undefined) =>
  testRuleInput({ lookup: testLookup({ unitLevel: () => level }) });

describe("talents harness rules", () => {
  test("points gives one talents/points row and no level, which the level-up packet leaves stale", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      talents({ after: 3, before: 0, type: "points" }),
      atLevel(1),
    );
    expect(rows.map((row) => [row.event, row.data])).toEqual([
      ["talents/points", { after: 3, before: 0 }],
    ]);
    expect(rows[0]?.text).toContain("3 talent points");
  });

  test("info with gained ranks gives one talents/learned row per talent, rank 1-based", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      talents({
        ...EMPTY_INFO,
        pointsAfter: 1,
        pointsBefore: 3,
        talents: [
          { from: 0, talentId: 1862, to: 2 },
          { from: 1, talentId: 1868, to: 0 },
          { from: 0, talentId: 1870, to: 1 },
        ],
      }),
      atLevel(12),
    );
    expect(rows.map((row) => [row.event, row.data])).toEqual([
      ["talents/learned", { freePoints: 1, rank: 2, talentId: 1862 }],
      ["talents/learned", { freePoints: 1, rank: 1, talentId: 1870 }],
    ]);
    expect(rows[0]?.text).toContain("Learned");
    expect(rows[0]?.text).toContain("rank 2");
  });

  test("wipe_offer gives one talents/wipe_offer row naming the cost", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      talents({ cost: 10_000, npcGuid: 0x40n, type: "wipe_offer" }),
      atLevel(12),
    );
    expect(rows.map((row) => [row.event, row.data])).toEqual([
      ["talents/wipe_offer", { cost: 10_000 }],
    ]);
    expect(rows[0]?.text).toContain("1g");
    expect(rows[0]?.text).toContain("u64");
  });

  test("a reset info gives talents/reset and no points row for the same packet", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      talents({
        ...EMPTY_INFO,
        pointsAfter: 3,
        pointsBefore: 0,
        talents: [{ from: 1, talentId: 124, to: 0 }],
      }),
      atLevel(12),
    );
    expect(rows.map((row) => [row.event, row.data])).toEqual([
      ["talents/reset", { freePoints: 3 }],
    ]);
    expect(rows[0]?.text).toContain("Talents reset");
    expect(rows[0]?.text).toContain("3 points");
  });

  test("info with unchanged ranks but the same free points writes nothing", () => {
    expect(
      areaDrafts(areaRuleSet(), talents({ ...EMPTY_INFO }), atLevel(12)),
    ).toEqual([]);
  });

  test("wipe_refused writes nothing for the step to report", () => {
    expect(
      areaDrafts(areaRuleSet(), talents({ type: "wipe_refused" }), atLevel(12)),
    ).toEqual([]);
  });

  test("a level-up info with more points but no lost ranks writes nothing", () => {
    expect(
      areaDrafts(
        areaRuleSet(),
        talents({
          ...EMPTY_INFO,
          pointsAfter: 3,
          pointsBefore: 2,
          talents: [],
        }),
        atLevel(12),
      ),
    ).toEqual([]);
  });

  test("a reset info followed by its paired points event gives only the reset row", () => {
    const rules = areaRuleSet();
    const reset = areaDrafts(
      rules,
      talents({
        ...EMPTY_INFO,
        pointsAfter: 3,
        pointsBefore: 0,
        talents: [{ from: 1, talentId: 124, to: 0 }],
      }),
      atLevel(12),
    );
    const paired = areaDrafts(
      rules,
      talents({ after: 3, before: 0, type: "points" }),
      atLevel(12),
    );
    expect(reset.map((row) => [row.event, row.data])).toEqual([
      ["talents/reset", { freePoints: 3 }],
    ]);
    expect(paired).toEqual([]);
  });

  test("a later points rise after a reset still logs talents/points", () => {
    const rules = areaRuleSet();
    areaDrafts(
      rules,
      talents({
        ...EMPTY_INFO,
        pointsAfter: 3,
        pointsBefore: 0,
        talents: [{ from: 1, talentId: 124, to: 0 }],
      }),
      atLevel(12),
    );
    areaDrafts(
      rules,
      talents({ after: 3, before: 0, type: "points" }),
      atLevel(12),
    );
    const later = areaDrafts(
      rules,
      talents({ after: 4, before: 3, type: "points" }),
      atLevel(12),
    );
    expect(later.map((row) => row.event)).toEqual(["talents/points"]);
  });

  test("an info with a glyph change gives one talents/glyph row per slot", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      talents({
        ...EMPTY_INFO,
        glyphs: [
          { from: 0, slot: 1, to: 43_395 },
          { from: 43_395, slot: 0, to: 0 },
        ],
      }),
      atLevel(15),
    );
    expect(rows.map((row) => [row.event, row.data])).toEqual([
      ["talents/glyph", { glyphId: 43_395, slot: 2 }],
      ["talents/glyph", { glyphId: 0, slot: 1 }],
    ]);
    expect(rows[0]?.text).toContain("slot 2");
    expect(rows[1]?.text).toContain("slot 1");
    expect(rows[1]?.text).toContain("cleared");
  });

  test("a reset info with a glyph change keeps both the reset and glyph rows", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      talents({
        ...EMPTY_INFO,
        glyphs: [{ from: 43_395, slot: 1, to: 0 }],
        pointsAfter: 6,
        pointsBefore: 0,
        talents: [{ from: 1, talentId: 124, to: 0 }],
      }),
      atLevel(15),
    );
    expect(rows.map((row) => row.event)).toEqual([
      "talents/reset",
      "talents/glyph",
    ]);
  });
});
