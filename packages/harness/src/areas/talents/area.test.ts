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
    expect<unknown[]>(rows).toEqual([
      {
        class: "log",
        data: { after: 3, before: 0 },
        domain: "talents",
        event: "talents/points",
        text: "3 talent points free.",
      },
    ]);
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
    expect(rows[0]?.text).toBe("Learned talent 1862 rank 2.");
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
    expect(rows[0]?.text).toBe("Talent reset offered for 1g by u64.");
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
    expect(rows[0]?.text).toBe("Talents reset. 3 points free.");
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
});
