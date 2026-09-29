import { describe, expect, test } from "bun:test";
import { meleeEntry, spellDamageEntry } from "#wow/areas/combatlog/entries";

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
