import { describe, expect, test } from "bun:test";
import {
  healEntry,
  meleeEntry,
  periodicEntries,
  spellDamageEntry,
} from "#wow/areas/combatlog/entries";

const ME = 0x2an;
const BOAR = 0xf1_30_00_3e_ea_00_0a_bcn;

describe("entry builders", () => {
  test("a swing becomes one melee entry with summed absorbs and its outcome", () => {
    expect(
      meleeEntry({
        absorbed: [3, 1],
        attacker: BOAR,
        crit: false,
        crushing: false,
        glancing: false,
        hitInfo: 0x42,
        meleeSpellId: 0,
        miss: false,
        offhand: false,
        overkill: 0,
        parts: [
          { amount: 20, schoolMask: 1 },
          { amount: 8, schoolMask: 4 },
        ],
        resisted: [],
        target: ME,
        total: 28,
        victimState: "hit",
      }),
    ).toEqual({
      absorbed: 4,
      amount: 28,
      kind: "melee",
      schoolMask: 5,
      source: BOAR,
      target: ME,
    });
  });

  test("a missed or dodged swing names its outcome", () => {
    const base = {
      absorbed: [],
      attacker: ME,
      crit: false,
      crushing: false,
      glancing: false,
      hitInfo: 0x10,
      meleeSpellId: 0,
      miss: true,
      offhand: false,
      overkill: 0,
      parts: [{ amount: 0, schoolMask: 1 }],
      resisted: [],
      target: BOAR,
      total: 0,
      victimState: "intact",
    };
    expect(meleeEntry(base).outcome).toBe("miss");
    expect(
      meleeEntry({ ...base, hitInfo: 0x2, miss: false, victimState: "parry" })
        .outcome,
    ).toBe("parry");
  });

  test("a spell hit becomes one spell_damage entry", () => {
    expect(
      spellDamageEntry({
        absorbed: 0,
        amount: 31,
        attacker: ME,
        blocked: 0,
        crit: true,
        hitFlags: 2,
        overkill: 4,
        physical: false,
        resisted: 3,
        schoolMask: 4,
        spellId: 133,
        split: false,
        target: BOAR,
      }),
    ).toEqual({
      amount: 31,
      crit: true,
      kind: "spell_damage",
      over: 4,
      resisted: 3,
      schoolMask: 4,
      source: ME,
      spellId: 133,
      target: BOAR,
    });
  });
});

describe("heal, energize and periodic builders", () => {
  test("a heal takes the caster as source and keeps the effective amount", () => {
    expect(
      healEntry({
        absorbed: 4,
        caster: BOAR,
        crit: true,
        heal: 540,
        overheal: 40,
        spellId: 2050,
        victim: ME,
      }),
    ).toEqual({
      absorbed: 4,
      amount: 500,
      crit: true,
      kind: "heal",
      over: 40,
      source: BOAR,
      spellId: 2050,
      target: ME,
    });
  });

  test("an all-overheal heal keeps amount 0 and the overheal", () => {
    const entry = healEntry({
      absorbed: 0,
      caster: BOAR,
      crit: false,
      heal: 100,
      overheal: 100,
      spellId: 1,
      victim: ME,
    });
    expect(entry.amount).toBe(0);
    expect(entry.over).toBe(100);
  });

  test("each tick family maps to its kind and fields", () => {
    const log = { caster: BOAR, spellId: 133, victim: ME };
    expect(
      periodicEntries({
        ...log,
        ticks: [
          {
            absorbed: 1,
            amount: 12,
            auraType: 3,
            crit: false,
            overkill: 2,
            resisted: 3,
            schoolMask: 4,
            type: "damage",
          },
          {
            absorbed: 0,
            amount: 30,
            auraType: 8,
            crit: true,
            overheal: 10,
            type: "heal",
          },
          { amount: 20, auraType: 24, power: 0, type: "power" },
        ],
      }),
    ).toEqual([
      {
        absorbed: 1,
        amount: 12,
        kind: "periodic_damage",
        over: 2,
        resisted: 3,
        schoolMask: 4,
        source: BOAR,
        spellId: 133,
        target: ME,
      },
      {
        amount: 20,
        crit: true,
        kind: "periodic_heal",
        over: 10,
        source: BOAR,
        spellId: 133,
        target: ME,
      },
      {
        amount: 20,
        kind: "periodic_power",
        power: 0,
        source: BOAR,
        spellId: 133,
        target: ME,
      },
    ]);
  });
});
