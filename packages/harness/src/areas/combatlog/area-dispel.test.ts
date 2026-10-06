import { describe, expect, test } from "bun:test";
import type { AreaEvent, AreaEventOf } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

type CombatlogEvent = AreaEventOf<"combatlog">;

const ME = 0x2an;
const MAGE = 0x2bn;

function session() {
  const rules = areaRuleSet();
  const rc = testRuleInput({
    lookup: testLookup({
      unitName: (guid) => (guid === MAGE ? "Defias Mage" : undefined),
    }),
    selfGuid: ME,
  });
  return (event: CombatlogEvent) =>
    areaDrafts(rules, { area: "combatlog", event } as AreaEvent, rc);
}

function entry(over: Record<string, unknown> = {}): CombatlogEvent {
  return {
    amount: 0,
    at: 1000,
    extra: 168,
    kind: "dispel",
    source: MAGE,
    spellId: 527,
    target: ME,
    type: "entry",
    ...over,
  } as CombatlogEvent;
}

describe("combatlog dispelled rule", () => {
  test("a dispel of the character's buff writes one log row naming the aura", () => {
    const rows = session()(entry());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "log",
      data: { aura: 168, kind: "dispel", spellId: 527 },
      domain: "combatlog",
      event: "combatlog/dispelled",
    });
    expect(rows[0]?.text).toContain("Defias Mage");
    expect(rows[0]?.text).toContain("dispels");
  });

  test("a steal reads as stealing", () => {
    const rows = session()(entry({ kind: "steal" }));
    expect(rows[0]?.text).toContain("steals");
    expect(rows[0]?.data).toMatchObject({ kind: "steal" });
  });

  test("each aura of a multi-aura dispel writes its own row", () => {
    const rows = session();
    expect(rows(entry({ extra: 168 }))).toHaveLength(1);
    expect(rows(entry({ extra: 774 }))).toHaveLength(1);
  });

  test("the character's own dispel, a dispel on someone else, an unknown caster, a failed dispel and an execute write nothing", () => {
    const rows = session();
    expect(rows(entry({ source: ME }))).toEqual([]);
    expect(rows(entry({ source: 0x2cn, target: MAGE }))).toEqual([]);
    expect(rows(entry({ source: 0n }))).toEqual([]);
    expect(rows(entry({ kind: "dispel_failed" }))).toEqual([]);
    expect(rows(entry({ kind: "execute" }))).toEqual([]);
  });
});
