import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

const UNIT = 0xf1_30_00_3e_ea_00_0a_bcn;
const OTHER = 0xf1_30_00_3e_ea_00_0a_bdn;

function speed(
  value: number,
  previous: number | undefined,
  over: { guid?: bigint; kind?: "run" | "swim"; self?: boolean } = {},
): AreaEvent {
  return {
    area: "unitmotion",
    event: {
      guid: over.guid ?? UNIT,
      kind: over.kind ?? "run",
      previous,
      self: over.self ?? false,
      type: "speed",
      value,
    },
  };
}

function flag(
  name: "root" | "hover" | "disable_gravity",
  on: boolean,
  over: { guid?: bigint; self?: boolean } = {},
): AreaEvent {
  return {
    area: "unitmotion",
    event: {
      flag: name,
      flags: 0,
      guid: over.guid ?? UNIT,
      on,
      self: over.self ?? false,
      type: "flag",
    },
  };
}

function fighting(now = 1_000_000) {
  const rc = testRuleInput({
    lookup: testLookup({
      unitName: (guid) => (guid === UNIT ? "Springpaw Stalker" : undefined),
    }),
    now,
  });
  rc.memo.fights.set("run1", { at: now, guid: UNIT });
  return rc;
}

describe("unitmotion harness rules", () => {
  test("a slow of a fight unit writes one slowed row, the speed-up a sped row", () => {
    const rules = areaRuleSet();
    const rc = fighting();
    const slowed = areaDrafts(rules, speed(3.5, 7), rc);
    expect(slowed).toHaveLength(1);
    expect(slowed[0]).toMatchObject({
      class: "log",
      domain: "unitmotion",
      event: "unitmotion/slowed",
    });
    expect(slowed[0]?.text).toContain("Springpaw Stalker");
    expect(slowed[0]?.text).toContain("slowed to 50%");
    const sped = areaDrafts(rules, speed(7, 3.5), { ...rc, now: rc.now + 500 });
    expect(sped.map((row) => row.event)).toEqual(["unitmotion/sped"]);
  });

  test("root on and off write rooted and freed rows", () => {
    const rules = areaRuleSet();
    const rc = fighting();
    const rooted = areaDrafts(rules, flag("root", true), rc);
    expect(rooted.map((row) => row.event)).toEqual(["unitmotion/rooted"]);
    expect(rooted[0]?.text).toContain("Springpaw Stalker");
    const freed = areaDrafts(rules, flag("root", false), {
      ...rc,
      now: rc.now + 3000,
    });
    expect(freed.map((row) => row.event)).toEqual(["unitmotion/freed"]);
  });

  test("a unit that last attacked us counts as in the fight", () => {
    const rules = areaRuleSet();
    const rc = testRuleInput({
      lookup: testLookup({ lastAttacker: () => OTHER, unitName: () => "Mob" }),
    });
    const rows = areaDrafts(rules, speed(3.5, 7, { guid: OTHER }), rc);
    expect(rows.map((row) => row.event)).toEqual(["unitmotion/slowed"]);
  });

  test("events within 100 ms of a row for the same guid write none", () => {
    const rules = areaRuleSet();
    const rc = fighting();
    expect(areaDrafts(rules, speed(3.5, 7), rc)).toHaveLength(1);
    expect(
      areaDrafts(rules, flag("root", true), { ...rc, now: rc.now + 99 }),
    ).toEqual([]);
    expect(
      areaDrafts(rules, flag("root", true), { ...rc, now: rc.now + 100 }),
    ).toHaveLength(1);
  });

  test("other guids keep separate throttles", () => {
    const rules = areaRuleSet();
    const rc = fighting();
    rc.memo.fights.set("run2", { at: rc.now, guid: OTHER });
    expect(areaDrafts(rules, speed(3.5, 7), rc)).toHaveLength(1);
    expect(areaDrafts(rules, speed(3.5, 7, { guid: OTHER }), rc)).toHaveLength(
      1,
    );
  });

  test("the other six speed kinds of a snare write no row", () => {
    const rules = areaRuleSet();
    const rc = fighting();
    expect(areaDrafts(rules, speed(2.4, 4.7, { kind: "swim" }), rc)).toEqual(
      [],
    );
  });

  test("a unit outside the fight, a self event, hover, gravity and removed write none", () => {
    const rules = areaRuleSet();
    const rc = fighting();
    const events: AreaEvent[] = [
      speed(3.5, 7, { guid: OTHER }),
      speed(3.5, 7, { self: true }),
      flag("hover", true),
      flag("disable_gravity", true),
      flag("root", true, { self: true }),
      flag("root", true, { guid: OTHER }),
      {
        area: "unitmotion",
        event: { guid: UNIT, self: false, type: "removed" },
      },
    ];
    for (const event of events)
      expect(areaDrafts(rules, event, rc)).toEqual([]);
  });

  test("a speed event with no slowdown or no previous speed writes none", () => {
    const rules = areaRuleSet();
    const rc = fighting();
    expect(areaDrafts(rules, speed(7, undefined), rc)).toEqual([]);
    expect(areaDrafts(rules, speed(7, 7), rc)).toEqual([]);
  });
});
