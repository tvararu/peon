import { describe, expect, test } from "bun:test";
import type { AreaEvent, AreaEventOf } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import type { RuleInput } from "#harness/events/rules";
import { createMockGame } from "#test-support/mock-game";
import { routerSetup } from "#test-support/router-fixture";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

type CombatlogEvent = AreaEventOf<"combatlog">;

const ME = 0x2an;
const MATE = 0x2bn;
const PET = 0xf1_40_00_0c_82_00_01_b2n;
const BOAR = 0xf1_30_00_0c_1a_00_0a_bcn;
const BOAR_TWO = 0xf1_30_00_0c_1a_00_0a_bdn;

const NAMES = new Map<bigint, string>([
  [BOAR, "Mottled Boar"],
  [BOAR_TWO, "Mottled Boar"],
  [MATE, "Mate"],
]);

function input(over: Partial<RuleInput> = {}): RuleInput {
  return testRuleInput({
    lookup: testLookup({ unitName: (guid) => NAMES.get(guid) }),
    selfGuid: ME,
    ...over,
  });
}

function wrap(event: CombatlogEvent): AreaEvent {
  return { area: "combatlog", event };
}

function entry(over: Partial<CombatlogEvent> = {}): CombatlogEvent {
  return {
    amount: 9,
    at: 50,
    kind: "melee",
    source: BOAR,
    target: ME,
    type: "entry",
    ...over,
  } as CombatlogEvent;
}

function kill(over: Partial<CombatlogEvent> = {}): CombatlogEvent {
  return {
    at: 60,
    bySelf: 0,
    killer: MATE,
    killerKind: "player",
    ourTarget: 1,
    type: "kill",
    victim: BOAR,
    ...over,
  } as CombatlogEvent;
}

function closed(over: Partial<CombatlogEvent> = {}): CombatlogEvent {
  return {
    crits: 1,
    dealt: 312,
    healed: 0,
    lastAt: 19_000,
    misses: { dodge: 1, resist: 1 },
    startedAt: 10_000,
    taken: 145,
    type: "fight_closed",
    ...over,
  } as CombatlogEvent;
}

function session() {
  const rules = areaRuleSet();
  const rc = input();
  return (event: CombatlogEvent) => areaDrafts(rules, wrap(event), rc);
}

const immuneSpell = entry({
  amount: 0,
  kind: "immune",
  source: ME,
  spellId: 122,
  target: BOAR,
});

describe("combatlog harness rules", () => {
  test("damage, heal and kill-by-self entries write no row", () => {
    const rows = session();
    const quiet = [
      entry({ kind: "spell_damage", source: ME, spellId: 133, target: BOAR }),
      entry({ kind: "melee", outcome: "dodge", source: ME, target: BOAR }),
      entry({ kind: "heal", source: ME, spellId: 2050, target: ME }),
      entry({ kind: "kill", source: ME, target: BOAR }),
      entry({ kind: "immune", source: BOAR, spellId: 122, target: ME }),
      kill({ bySelf: 1, killer: ME, killerKind: "self" }),
      entry({ kind: "immune", source: PET, spellId: 122, target: BOAR }),
      entry({ outcome: "immune", source: PET, target: BOAR }),
      kill({ killerKind: "creature" }),
      kill({ killer: PET, killerKind: "pet" }),
      kill({ ourTarget: 0 }),
    ];
    expect(quiet.flatMap(rows)).toEqual([]);
  });

  test("an immunity writes one combatlog/immune row per creature entry and spell", () => {
    const rows = session();
    const [first, ...rest] = [
      ...rows(immuneSpell),
      ...rows(immuneSpell),
      ...rows({ ...immuneSpell, target: BOAR_TWO } as CombatlogEvent),
    ];
    expect(rest).toEqual([]);
    expect(first).toMatchObject({
      class: "log",
      data: { entry: 3098, name: "Mottled Boar", spellId: 122 },
      domain: "combatlog",
      event: "combatlog/immune",
      text: expect.stringContaining(`Mottled Boar u${BOAR}`),
    });
    expect(rows({ ...immuneSpell, spellId: 116 } as CombatlogEvent)).toEqual([
      expect.objectContaining({ event: "combatlog/immune" }),
    ]);
  });

  test("a spell miss for immunity and an immune swing each write the row once", () => {
    const rows = session();
    const missed = entry({
      amount: 0,
      kind: "miss",
      outcome: "immune2",
      source: ME,
      spellId: 5143,
      target: BOAR,
    });
    const swing = entry({ outcome: "immune", source: ME, target: BOAR });
    const missRows = [...rows(missed), ...rows(missed)];
    expect(missRows).toEqual([
      expect.objectContaining({ event: "combatlog/immune" }),
    ]);
    expect(missRows[0]?.text).toContain(`Mottled Boar u${BOAR}`);
    expect(missRows[0]?.text).toContain("spell 5143");
    const swingRows = [...rows(swing), ...rows(swing)];
    expect(swingRows).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ spellId: 0 }),
        event: "combatlog/immune",
      }),
    ]);
    expect(swingRows[0]?.text).toContain(`Mottled Boar u${BOAR}`);
    expect(swingRows[0]?.text).toContain("your attacks");
  });

  test("a pet's immunity leaves the character's own row to be written", () => {
    const rows = session();
    const petSwing = entry({ outcome: "immune", source: PET, target: BOAR });
    const swing = entry({ outcome: "immune", source: ME, target: BOAR });
    expect([...rows(petSwing), ...rows(swing)]).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ source: "2a", spellId: 0 }),
        event: "combatlog/immune",
      }),
    ]);
  });

  test("a kill of the character's target by another player writes combatlog/killing_blow", () => {
    const rows = session();
    const drafts = rows(kill());
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toEqual({
      class: "log",
      data: {
        killer: "2b",
        killerKind: "player",
        killerName: "Mate",
        name: "Mottled Boar",
        unit: "f130000c1a000abc",
      },
      domain: "combatlog",
      event: "combatlog/killing_blow",
      guid: "f130000c1a000abc",
      ref: `u${BOAR}`,
      text: expect.any(String),
    });
    expect(drafts[0]?.text).toContain(`Mate u${MATE}`);
    expect(drafts[0]?.text).toContain(`Mottled Boar u${BOAR}`);
  });

  test("a closed fight writes one combatlog/fight row with its totals", () => {
    const rows = session();
    const drafts = rows(closed());
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toEqual({
      class: "log",
      data: {
        crits: 1,
        dealt: 312,
        durationMs: 9000,
        healed: 0,
        misses: { dodge: 1, resist: 1 },
        taken: 145,
      },
      domain: "combatlog",
      event: "combatlog/fight",
      text: expect.any(String),
    });
  });

  test("the router writes the rows of area events from the handle", () => {
    const { log, router } = routerSetup({ selfGuid: ME });
    const handle = createMockGame();
    router.attach(handle);
    handle.triggerAreaEvent("combatlog", immuneSpell);
    handle.triggerAreaEvent("combatlog", immuneSpell);
    handle.triggerAreaEvent("combatlog", entry());
    handle.triggerAreaEvent("combatlog", kill());
    handle.triggerAreaEvent("combatlog", closed());
    expect(log.since(0).map((row) => [row.class, row.event])).toEqual([
      ["log", "combatlog/immune"],
      ["log", "combatlog/killing_blow"],
      ["log", "combatlog/fight"],
    ]);
  });
});
