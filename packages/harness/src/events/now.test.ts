import { describe, expect, test } from "bun:test";
import type { NowSnapshot, SelfView, UnitView } from "#harness/contract/views";
import { formatNow, NOW_MAX_CHARS } from "#harness/events/now";

const at = Date.UTC(2026, 8, 26, 19, 13, 31);

const self: SelfView = {
  className: "Priest",
  copper: 1200,
  freeSlots: 10,
  guid: "1",
  hp: 190,
  inCombat: true,
  level: 10,
  life: "alive",
  maxHp: 217,
  maxPower: 100,
  mounted: false,
  name: "Fgklibhlflc",
  pose: {
    ageMs: 0,
    facing: "N",
    mapId: 530,
    serverFixAgeMs: 3000,
    source: "server",
    x: 8813.4,
    y: -6691.2,
    z: 72.7,
  },
  power: 88,
  powerKind: "mana",
  race: "Blood Elf",
  xpPct: 40,
};

function unit(ref: string, name: string, distance: number): UnitView {
  return {
    alive: true,
    attackable: true,
    attackingMe: false,
    compass: "N",
    distance,
    entry: 15_366,
    guid: ref.slice(1),
    hp: 35,
    hpPct: 26,
    inView: true,
    kind: "creature",
    level: 7,
    lootable: false,
    maxHp: 137,
    name,
    ref,
    relation: "hostile",
    roles: [],
    seenAgoMs: 0,
    tappedByOther: false,
    targetsMe: true,
    x: 0,
    y: 0,
    z: 0,
  };
}

function snapshot(over: Partial<NowSnapshot> = {}): NowSnapshot {
  const stalker = unit("u9", "Springpaw Stalker", 23);
  return {
    at,
    attackers: [
      {
        distance: 4,
        guid: "9",
        hitAgoMs: 3000,
        name: "Springpaw Stalker",
        ref: "u9",
      },
    ],
    hpDelta5s: -23,
    nearest: {
      hostile: unit("u12", "Mana Wyrm", 41),
      questgiver: {
        ...unit("u3", "Magistrix Erona", 58),
        relation: "friendly",
      },
    },
    noProgress: undefined,
    place: {
      ageMs: 1000,
      area: "Fairbreeze Village",
      areaId: 3665,
      zone: "Eversong Woods",
      zoneId: 3430,
    },
    recovery: undefined,
    run: {
      elapsedMs: 9000,
      id: "r4",
      kind: "engage",
      label: "engage u9",
      progress: undefined,
    },
    self,
    selfCast: undefined,
    target: stalker,
    targetAuras: [],
    wake: true,
    ...over,
  };
}

describe("formatNow", () => {
  test("matches the design C.3 example", () => {
    expect(formatNow(snapshot())).toBe(
      "[now 19:13:31] Fgklibhlflc L10 Priest HP 190/217 (-23 in 5s) mana 88/100 alive in combat · Eversong Woods, Fairbreeze Village (8813,-6691) server fix 3s · target Springpaw Stalker u9 hostile 23y 35/137 · attackers u9 · running r4 engage 9s · nearest hostile u12 41y, questgiver u3 58y",
    );
  });

  test("drops nearest first, then the rest, and never self, place or running", () => {
    const long = "A".repeat(90);
    const crowded = snapshot({
      nearest: { hostile: unit("u12", long, 41), player: unit("u20", long, 9) },
      target: unit("u9", long, 23),
    });
    const line = formatNow(crowded);
    expect(line.length).toBeLessThanOrEqual(NOW_MAX_CHARS);
    expect(line).not.toContain("nearest");
    expect(line).toContain("running r4 engage 9s");
    expect(line).toContain("Eversong Woods, Fairbreeze Village");
    const huge = formatNow(
      snapshot({ target: unit("u9", "B".repeat(300), 23) }),
    );
    expect(huge).not.toContain("target");
    expect(huge).toContain("running r4 engage 9s");
    expect(huge.length).toBeLessThanOrEqual(NOW_MAX_CHARS);
  });

  test("shows a cast and a corpse, and drops them before attackers", () => {
    const cast = { elapsedMs: 1200, spell: "Smite", totalMs: 2500 };
    const recovery = {
      corpseCompass: "NE" as const,
      corpseYd: 41,
      reclaimInMs: 12_000,
      spiritHealer: undefined,
    };
    const line = formatNow(snapshot({ nearest: {}, recovery, selfCast: cast }));
    expect(line).toContain(
      "casting Smite 1.2/2.5s · running r4 engage 9s · corpse 41y NE reclaim in 12s",
    );
  });

  test("adds the no-progress line and the wake-off line", () => {
    const noProgress = {
      actions: 5,
      lastRefusal: "travel no_ground x3",
      sinceMs: 180_000,
      untried: ['travel(to: "unstick")'],
    };
    const [, second, third] = formatNow(
      snapshot({ noProgress, wake: false }),
    ).split("\n");
    expect(second).toBe(
      'No progress: 5 actions in 3 min (last refusal travel no_ground x3). Change plan. Untried: travel(to: "unstick").',
    );
    expect(third).toBe("Wake is off.");
  });

  test("handles a quiet state with no pose, no power, no target and no run", () => {
    const quiet = snapshot({
      attackers: [],
      hpDelta5s: undefined,
      nearest: {},
      place: {
        ageMs: undefined,
        area: undefined,
        areaId: undefined,
        zone: undefined,
        zoneId: undefined,
      },
      run: undefined,
      self: { ...self, inCombat: false, pose: undefined, powerKind: "none" },
      target: undefined,
    });
    expect(formatNow(quiet)).toBe(
      "[now 19:13:31] Fgklibhlflc L10 Priest HP 190/217 alive · unknown zone (no position)",
    );
  });

  test("says mounted after the combat word only while mounted", () => {
    const line = formatNow(snapshot({ self: { ...self, mounted: true } }));
    expect(line).toContain("alive in combat mounted ·");
    expect(formatNow(snapshot())).not.toContain("mounted");
  });
});

describe("formatNow breath", () => {
  test("shows the seconds of breath after the vitals and never drops it", () => {
    const long = "A".repeat(90);
    const line = formatNow(
      snapshot({
        breathS: 45,
        nearest: { hostile: unit("u12", long, 41) },
        target: unit("u9", long, 23),
      }),
    );
    expect(line).toContain("alive in combat · breath 45 s · Eversong Woods");
    expect(line).toContain("breath 45 s");
    expect(line.length).toBeLessThanOrEqual(NOW_MAX_CHARS);
  });

  test("shows nothing without a breath timer", () => {
    expect(formatNow(snapshot({ breathS: undefined }))).not.toContain("breath");
    expect(formatNow(snapshot())).not.toContain("breath");
  });
});

describe("formatNow combo points", () => {
  test("shows CP after the power when the character holds any", () => {
    const line = formatNow(snapshot({ self: { ...self, comboPoints: 3 } }));
    expect(line).toContain("mana 88/100 CP 3 alive");
  });

  test("shows nothing at zero or without the field", () => {
    expect(formatNow(snapshot())).not.toContain("CP");
    expect(
      formatNow(snapshot({ self: { ...self, comboPoints: 0 } })),
    ).not.toContain("CP");
  });
});
