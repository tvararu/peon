import { describe, expect, test } from "bun:test";
import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { threatHarness } from "#harness/areas/threat/area";
import type { RuleInput } from "#harness/events/rules";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

type ThreatEvent = AreaEventOf<"threat">;

const SELF = 0xdc5n;
const PET = 0xf1_40_00_0c_82_00_01_b2n;
const MATE = 0xdc9n;
const THUG = 0xf1_30_00_3d_1d_00_f1_7dn;
const SHADE = 0xf1_30_00_3d_28_01_28_c6n;

const NAMES = new Map<bigint, string>([
  [THUG, "Wretched Thug"],
  [SHADE, "Angershade"],
  [PET, "Cat"],
  [MATE, "Mate"],
]);

function input(over: Partial<RuleInput> = {}): RuleInput {
  return testRuleInput({
    lookup: testLookup({ unitName: (guid) => NAMES.get(guid) }),
    selfGuid: SELF,
    ...over,
  });
}

function rules() {
  const event = threatHarness.rules?.().event;
  if (!event) throw new Error("threat has no event rule");
  return (e: ThreatEvent, rc: RuleInput = input()): readonly AreaDraft[] =>
    event(e, rc);
}

function entry(victim: bigint, threat: number, isVictim = false) {
  return { isVictim, pct: 0, threat, victim };
}

function table(
  unit: bigint,
  victim: bigint | undefined,
  entries: ReturnType<typeof entry>[],
): ThreatEvent {
  return { entries, type: "table", unit, victim };
}

const fightingMe = table(THUG, SELF, [entry(SELF, 900, true)]);

describe("threat flood guard", () => {
  test("table, removed, cleared and a hostile reaction give no row and no fallback", () => {
    const rc = input();
    const set = areaRuleSet();
    const quiet: ThreatEvent[] = [
      table(SHADE, MATE, [entry(MATE, 500, true)]),
      { type: "removed", unit: SHADE, victim: MATE },
      { type: "cleared", unit: SHADE },
      {
        code: 2,
        pet: false,
        reaction: "hostile",
        type: "reaction",
        unit: THUG,
      },
      { hostileOnly: false, type: "target_broken", unit: SHADE },
    ];
    for (const event of quiet)
      expect(areaDrafts(set, { area: "threat", event }, rc)).toEqual([]);
  });
});

describe("threat/engaged", () => {
  test("the first table that holds the character wakes outside a run", () => {
    const event = rules();
    const rows = event(fightingMe);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "wake",
      data: { name: "Wretched Thug", unit: THUG.toString(16) },
      guid: THUG.toString(16),
      name: "engaged",
      ref: `u${THUG}`,
    });
    expect(rows[0]?.text).toContain(`Wretched Thug u${THUG}`);
    expect(rows[0]?.text).toContain("fighting you");
    expect(event(fightingMe)).toEqual([]);
  });

  test("inside a run the row is a log row", () => {
    const [row] = rules()(fightingMe, input({ runActive: true }));
    expect(row).toMatchObject({ class: "log", name: "engaged" });
  });

  test("a table that does not hold the character gives no row", () => {
    expect(rules()(table(SHADE, MATE, [entry(MATE, 500, true)]))).toEqual([]);
  });

  test("a new victim on the character is the engagement, logged once", () => {
    const event = rules();
    const pull: ThreatEvent = {
      from: undefined,
      to: SELF,
      type: "victim_changed",
      unit: THUG,
    };
    expect(event(pull).map((row) => row.name)).toEqual(["engaged"]);
    expect(event(fightingMe)).toEqual([]);
  });

  test("after the character leaves the table or the table clears, a new entry logs again", () => {
    const event = rules();
    event(fightingMe);
    event({ type: "removed", unit: THUG, victim: PET });
    expect(event(fightingMe)).toEqual([]);
    event({ type: "removed", unit: THUG, victim: SELF });
    expect(event(fightingMe).map((row) => row.name)).toEqual(["engaged"]);
    event({ type: "cleared", unit: THUG });
    expect(event(fightingMe).map((row) => row.name)).toEqual(["engaged"]);
  });
});

describe("threat/aggro_switch", () => {
  const turn = (unit: bigint, from: bigint, to: bigint): ThreatEvent => ({
    from,
    to,
    type: "victim_changed",
    unit,
  });

  test("a switch from the pet to the character is a log row", () => {
    const event = rules();
    event(table(THUG, PET, [entry(PET, 900, true), entry(SELF, 100)]));
    const rows = event(turn(THUG, PET, SELF));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "log",
      data: {
        fromVictim: PET.toString(16),
        name: "Wretched Thug",
        toVictim: SELF.toString(16),
        unit: THUG.toString(16),
      },
      guid: THUG.toString(16),
      name: "aggro_switch",
      ref: `u${THUG}`,
    });
    expect(rows[0]?.text).toContain("Cat");
    expect(rows[0]?.text).toContain("to you");
  });

  test("a switch from another player to the character wakes", () => {
    const event = rules();
    event(table(SHADE, MATE, [entry(MATE, 500, true), entry(SELF, 100)]));
    const [row] = event(turn(SHADE, MATE, SELF));
    expect(row).toMatchObject({ class: "wake", name: "aggro_switch" });
    expect(row?.text).toContain("Mate");
    expect(row?.text).toContain("to you");
  });

  test("a switch from the character to the pet is a log row", () => {
    const event = rules();
    event(fightingMe);
    const [row] = event(turn(THUG, SELF, PET));
    expect(row).toMatchObject({ class: "log", name: "aggro_switch" });
    expect(row?.text).toContain("from you");
    expect(row?.text).toContain("Cat");
  });

  test("a switch between players on a unit not fighting the character gives no row", () => {
    expect(rules()(turn(SHADE, MATE, 0xdd0n))).toEqual([]);
  });

  test("on an engaged unit a switch with a player logs and one between creatures does not", () => {
    const event = rules();
    event(fightingMe);
    expect(event(turn(THUG, 0xf1_30_00_00_00_00_00_01n, MATE))).toEqual([
      expect.objectContaining({ name: "aggro_switch" }),
    ]);
    expect(event(turn(THUG, MATE, 0xf1_30_00_00_00_00_00_01n))).toEqual([
      expect.objectContaining({ name: "aggro_switch" }),
    ]);
    expect(
      event(turn(THUG, 0xf1_30_00_00_00_00_00_01n, 0xf1_30_00_00_00_00_00_02n)),
    ).toEqual([]);
  });
});

describe("threat/pull_warning", () => {
  const onMate = (mine: number) =>
    table(SHADE, MATE, [entry(MATE, 1000, true), entry(SELF, mine)]);

  test("near 90% of the melee pull point on another player's target warns once", () => {
    const event = rules();
    expect(event(onMate(980)).map((row) => row.name)).toEqual(["engaged"]);
    const rows = event(onMate(990));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "log",
      data: {
        mine: 990,
        name: "Angershade",
        pullAt: 1100,
        unit: SHADE.toString(16),
        victim: MATE.toString(16),
        victimThreat: 1000,
      },
      guid: SHADE.toString(16),
      name: "pull_warning",
      ref: `u${SHADE}`,
    });
    expect(rows[0]?.text).toContain("99%");
    expect(rows[0]?.text).toContain("Mate");
    expect(event(onMate(1050))).toEqual([]);
  });

  test("a new victim warns again", () => {
    const event = rules();
    event(onMate(1000));
    const other = 0xdd0n;
    const [row] = event(
      table(SHADE, other, [entry(other, 1000, true), entry(SELF, 1000)]),
    );
    expect(row?.name).toBe("pull_warning");
  });

  test("no warning when the victim is the pet, the character or a creature", () => {
    const event = rules();
    event(fightingMe);
    expect(
      event(table(THUG, PET, [entry(PET, 1000, true), entry(SELF, 1000)])),
    ).toEqual([]);
    expect(event(fightingMe)).toEqual([]);
  });
});

describe("threat/alerted", () => {
  test("an alert reaction wakes", () => {
    const rows = rules()({
      code: 0,
      pet: false,
      reaction: "alert",
      type: "reaction",
      unit: THUG,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "wake",
      data: { name: "Wretched Thug", unit: THUG.toString(16) },
      guid: THUG.toString(16),
      name: "alerted",
      ref: `u${THUG}`,
    });
    expect(rows[0]?.text).toContain(`Wretched Thug u${THUG}`);
    expect(rows[0]?.text).toContain("noticed you");
  });
});

describe("threat/target_lost", () => {
  const broken: ThreatEvent = {
    hostileOnly: false,
    type: "target_broken",
    unit: THUG,
  };

  test("a target break for an engaged unit logs once", () => {
    const event = rules();
    event(fightingMe);
    const [row] = event(broken);
    expect(row).toMatchObject({
      class: "log",
      data: {
        hostileOnly: false,
        name: "Wretched Thug",
        unit: THUG.toString(16),
      },
      guid: THUG.toString(16),
      name: "target_lost",
      ref: `u${THUG}`,
    });
    expect(row?.text).toContain(`Wretched Thug u${THUG}`);
    expect(row?.text).toContain("vanished from targeting");
    expect(event({ ...broken, hostileOnly: true })).toEqual([]);
  });

  test("a target break for a unit not fighting the character gives no row", () => {
    expect(rules()(broken)).toEqual([]);
  });
});
