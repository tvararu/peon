import { describe, expect, test } from "bun:test";
import type { AreaEvent, AreaEventOf } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

type CombatlogEvent = AreaEventOf<"combatlog">;

const ME = 0x2an;
const MATE = 0x2bn;
const PRIEST = 0x2cn;

const NAMES = new Map<bigint, string>([
  [MATE, "Mate"],
  [PRIEST, "Priest"],
]);

function session() {
  const rules = areaRuleSet();
  const rc = testRuleInput({
    lookup: testLookup({ unitName: (guid) => NAMES.get(guid) }),
    selfGuid: ME,
  });
  return (event: CombatlogEvent) =>
    areaDrafts(rules, { area: "combatlog", event } as AreaEvent, rc);
}

function heal(over: Partial<CombatlogEvent> = {}): CombatlogEvent {
  return {
    amount: 540,
    at: 1000,
    kind: "heal",
    source: MATE,
    spellId: 2050,
    target: ME,
    type: "entry",
    ...over,
  } as CombatlogEvent;
}

describe("combatlog heal_in rule", () => {
  test("the first heal from a healer writes one passive combatlog/heal_in row", () => {
    const rows = session();
    expect(rows(heal())).toEqual([
      expect.objectContaining({
        class: "passive",
        domain: "combatlog",
        event: "combatlog/heal_in",
        text: "Mate heals you for 540.",
      }),
    ]);
  });

  test("later heals from the same healer within 10 s write nothing, then one row after", () => {
    const rows = session();
    rows(heal({ at: 1000 } as Partial<CombatlogEvent>));
    expect(rows(heal({ at: 10_999 } as Partial<CombatlogEvent>))).toEqual([]);
    expect(rows(heal({ at: 11_000 } as Partial<CombatlogEvent>))).toHaveLength(
      1,
    );
  });

  test("a suppressed heal does not extend the window", () => {
    const rows = session();
    rows(heal({ at: 1000 } as Partial<CombatlogEvent>));
    rows(heal({ at: 9000 } as Partial<CombatlogEvent>));
    expect(rows(heal({ at: 11_000 } as Partial<CombatlogEvent>))).toHaveLength(
      1,
    );
  });

  test("each healer has its own window", () => {
    const rows = session();
    rows(heal());
    expect(
      rows(heal({ source: PRIEST } as Partial<CombatlogEvent>)),
    ).toHaveLength(1);
  });

  test("a periodic heal counts like a heal", () => {
    const rows = session();
    expect(
      rows(heal({ kind: "periodic_heal" } as Partial<CombatlogEvent>)),
    ).toHaveLength(1);
    expect(
      rows(heal({ at: 2000, kind: "heal" } as Partial<CombatlogEvent>)),
    ).toEqual([]);
  });

  test("self-heals, empty casters, zero effective heals and heals on others write nothing", () => {
    const rows = session();
    const quiet = [
      heal({ source: ME } as Partial<CombatlogEvent>),
      heal({ source: 0n } as Partial<CombatlogEvent>),
      heal({ amount: 0 } as Partial<CombatlogEvent>),
      heal({ source: PRIEST, target: MATE } as Partial<CombatlogEvent>),
    ];
    expect(quiet.flatMap(rows)).toEqual([]);
  });

  test("a zero-amount heal does not start the window", () => {
    const rows = session();
    rows(heal({ amount: 0 } as Partial<CombatlogEvent>));
    expect(rows(heal({ at: 1500 } as Partial<CombatlogEvent>))).toHaveLength(1);
  });

  test("an unnamed healer still gets a row", () => {
    const rows = session();
    const [row] = rows(heal({ source: 0x99n } as Partial<CombatlogEvent>));
    expect(row?.text).toContain("heals you for 540");
  });
});
