import { describe, expect, test } from "bun:test";
import type { AreaState } from "@peon/core";
import {
  aggroOn,
  engagedWith,
  threatOf,
  unitThreat,
} from "#harness/areas/threat/reads";

const SELF = 0xdc5n;
const PET = 0xf1_40_00_0c_82_00_01_b2n;
const MATE = 0xdc9n;
const THUG = 0xf1_30_00_3d_1d_00_f1_7dn;
const SHADE = 0xf1_30_00_3d_28_01_28_c6n;
const BOAR = 0xf1_30_00_3d_28_01_28_c7n;

const STATE: AreaState<"threat"> = {
  petReaction: undefined,
  reactions: [],
  tables: [
    {
      entries: [
        { isVictim: true, pct: 100, threat: 900, victim: SELF },
        { isVictim: false, pct: 33, threat: 300, victim: PET },
      ],
      pullAt: { melee: 990, ranged: 1170 },
      unit: THUG,
      updatedAt: 1,
      victim: SELF,
    },
    {
      entries: [
        { isVictim: true, pct: 100, threat: 500, victim: MATE },
        { isVictim: false, pct: 20, threat: 100, victim: SELF },
      ],
      pullAt: { melee: 550, ranged: 650 },
      unit: SHADE,
      updatedAt: 2,
      victim: MATE,
    },
    {
      entries: [],
      pullAt: undefined,
      unit: BOAR,
      updatedAt: 3,
      victim: SELF,
    },
  ],
};

describe("threat reads", () => {
  test("engagedWith lists every unit whose table holds the guid", () => {
    expect(engagedWith(STATE, SELF)).toEqual([THUG, SHADE]);
    expect(engagedWith(STATE, PET)).toEqual([THUG]);
    expect(engagedWith(STATE, 0x1n)).toEqual([]);
  });

  test("aggroOn lists every unit whose victim is the guid", () => {
    expect(aggroOn(STATE, SELF)).toEqual([THUG, BOAR]);
    expect(aggroOn(STATE, MATE)).toEqual([SHADE]);
    expect(aggroOn(STATE, PET)).toEqual([]);
  });

  test("threatOf gives the entry with its share and the unit's pull thresholds", () => {
    expect(threatOf(STATE, SHADE, SELF)).toEqual({
      isVictim: false,
      pct: 20,
      pullAt: { melee: 550, ranged: 650 },
      threat: 100,
      victim: SELF,
    });
  });

  test("threatOf is undefined for an unknown unit or a guid not in the table", () => {
    expect(threatOf(STATE, 0x2n, SELF)).toBeUndefined();
    expect(threatOf(STATE, SHADE, PET)).toBeUndefined();
    expect(threatOf(STATE, BOAR, SELF)).toBeUndefined();
  });

  test("unitThreat says whether the unit fights you, its aggro and your share", () => {
    const named = (guid: bigint) => (guid === MATE ? "Fgklibmate u4" : "?");
    expect(unitThreat(STATE, THUG, SELF, named)).toEqual({
      aggro: "you",
      fightingMe: true,
      myThreatPct: 100,
    });
    expect(unitThreat(STATE, SHADE, SELF, named)).toEqual({
      aggro: "Fgklibmate u4",
      fightingMe: true,
      myThreatPct: 20,
    });
    expect(unitThreat(STATE, SHADE, PET, named)).toEqual({
      aggro: "Fgklibmate u4",
      fightingMe: false,
      myThreatPct: undefined,
    });
    expect(unitThreat(STATE, 0x2n, SELF, named)).toBeUndefined();
  });
});
