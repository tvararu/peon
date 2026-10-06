import { describe, expect, test } from "bun:test";
import type { AreaEventOf } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

function talents(event: AreaEventOf<"talents">) {
  return { area: "talents", event } as const;
}

const atLevel = (level: number | undefined) =>
  testRuleInput({ lookup: testLookup({ unitLevel: () => level }) });

describe("talents refused rule", () => {
  test("refused gives one talents/refused log row per entry", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      talents({
        entries: [
          { rank: 1, reason: "not_enough_points", talentId: 124 },
          { rank: 0, reason: "unknown_talent", talentId: 1302 },
        ],
        outcome: "refused",
        type: "refused",
      }),
      atLevel(12),
    );
    expect(rows.map((row) => [row.event, row.data])).toEqual([
      [
        "talents/refused",
        { rank: 2, reason: "not_enough_points", talentId: 124 },
      ],
      [
        "talents/refused",
        { rank: 1, reason: "unknown_talent", talentId: 1302 },
      ],
    ]);
    expect(rows[0]?.text).toContain("rank 2");
    expect(rows[1]?.text).toContain("rank 1");
    expect(rows[0]?.text).toContain("not_enough_points");
    expect(rows[1]?.text).toContain("unknown_talent");
  });
});
