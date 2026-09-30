import { describe, expect, test } from "bun:test";
import {
  combatlogPeriodicAuraLogBody,
  combatlogSpellEnergizeBody,
  combatlogSpellHealBody,
} from "#test-support/areas/combatlog";
import {
  parsePeriodicAuraLog,
  parseSpellEnergize,
  parseSpellHeal,
} from "#wow/areas/combatlog/protocol";
import { PacketReader } from "#wow/protocol/packet";

const ME = 0x2an;
const MATE = 0x2bn;
const BOAR = 0xf1_30_00_3e_ea_00_0a_bcn;

function read(body: Uint8Array) {
  return new PacketReader(body);
}

describe("parseSpellHeal (Unit.cpp:8098-8107)", () => {
  test("reads victim before caster, then heal, overheal, absorb and crit", () => {
    const heal = parseSpellHeal(
      read(
        combatlogSpellHealBody({
          absorbed: 4,
          caster: MATE,
          crit: true,
          heal: 540,
          overheal: 40,
          spellId: 2050,
          victim: ME,
        }),
      ),
    );
    expect(heal).toEqual({
      absorbed: 4,
      caster: MATE,
      crit: true,
      heal: 540,
      overheal: 40,
      spellId: 2050,
      victim: ME,
    });
  });

  test("a non-crit heal reports crit false", () => {
    const heal = parseSpellHeal(
      read(
        combatlogSpellHealBody({
          caster: ME,
          heal: 10,
          spellId: 1,
          victim: ME,
        }),
      ),
    );
    expect(heal.crit).toBe(false);
  });
});

describe("parseSpellEnergize (Unit.cpp:8128-8134)", () => {
  test("reads victim, caster, spell, power type and amount", () => {
    const energize = parseSpellEnergize(
      read(
        combatlogSpellEnergizeBody({
          amount: 150,
          caster: ME,
          power: 0,
          spellId: 2455,
          victim: ME,
        }),
      ),
    );
    expect(energize).toEqual({
      amount: 150,
      caster: ME,
      power: 0,
      spellId: 2455,
      victim: ME,
    });
  });
});

describe("parsePeriodicAuraLog (Unit.cpp:6563-6606)", () => {
  const head = { caster: BOAR, spellId: 133, victim: ME };

  test.each([3, 89] as const)(
    "damage aura type %i reads a u32 school mask",
    (auraType) => {
      const log = parsePeriodicAuraLog(
        read(
          combatlogPeriodicAuraLogBody({
            ...head,
            tick: {
              absorbed: 2,
              amount: 12,
              auraType,
              crit: true,
              overkill: 3,
              resisted: 1,
              schoolMask: 4,
            },
          }),
        ),
      );
      expect(log).toEqual({
        caster: BOAR,
        spellId: 133,
        ticks: [
          {
            absorbed: 2,
            amount: 12,
            auraType,
            crit: true,
            overkill: 3,
            resisted: 1,
            schoolMask: 4,
            type: "damage",
          },
        ],
        victim: ME,
      });
    },
  );

  test.each([8, 20] as const)(
    "heal aura type %i reads amount, overheal, absorb, crit",
    (auraType) => {
      const log = parsePeriodicAuraLog(
        read(
          combatlogPeriodicAuraLogBody({
            ...head,
            tick: { absorbed: 1, amount: 30, auraType, overheal: 5 },
          }),
        ),
      );
      expect(log.ticks).toEqual([
        {
          absorbed: 1,
          amount: 30,
          auraType,
          crit: false,
          overheal: 5,
          type: "heal",
        },
      ]);
    },
  );

  test.each([21, 24] as const)(
    "power aura type %i reads power then amount",
    (auraType) => {
      const log = parsePeriodicAuraLog(
        read(
          combatlogPeriodicAuraLogBody({
            ...head,
            tick: { amount: 20, auraType, power: 1 },
          }),
        ),
      );
      expect(log.ticks).toEqual([
        { amount: 20, auraType, power: 1, type: "power" },
      ]);
    },
  );

  test("mana leech 64 reads and drops the multiplier", () => {
    const body = combatlogPeriodicAuraLogBody({
      ...head,
      tick: { amount: 7, auraType: 64, multiplier: 1.5, power: 0 },
    });
    const r = read(body);
    const log = parsePeriodicAuraLog(r);
    expect(log.ticks).toEqual([
      { amount: 7, auraType: 64, power: 0, type: "power" },
    ]);
    expect(r.remaining).toBe(0);
  });

  test("an unknown aura type throws", () => {
    expect(() =>
      parsePeriodicAuraLog(
        read(combatlogPeriodicAuraLogBody({ ...head, tick: { auraType: 4 } })),
      ),
    ).toThrow();
  });

  test("an empty caster guid reads as 0", () => {
    const log = parsePeriodicAuraLog(
      read(
        combatlogPeriodicAuraLogBody({
          caster: 0n,
          spellId: 1,
          tick: { amount: 1, auraType: 21, power: 0 },
          victim: ME,
        }),
      ),
    );
    expect(log.caster).toBe(0n);
  });
});
