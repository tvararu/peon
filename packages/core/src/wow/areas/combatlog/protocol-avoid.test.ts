import { describe, expect, test } from "bun:test";
import {
  combatlogDamageShieldBody,
  combatlogEnvironmentalDamageBody,
  combatlogInstakillBody,
  combatlogSpellImmuneBody,
  combatlogSpellMissBody,
} from "#test-support/areas/combatlog";
import {
  parseDamageShield,
  parseEnvironmentalDamage,
  parseInstakill,
  parseSpellImmune,
  parseSpellMiss,
} from "#wow/areas/combatlog/protocol";
import { PacketReader } from "#wow/protocol/packet";

const ME = 0x2an;
const MATE = 0x2bn;
const BOAR = 0xf1_30_00_3e_ea_00_0a_bcn;
const WOLF = 0xf1_30_00_3e_ea_00_0a_bdn;

function read(body: Uint8Array) {
  return new PacketReader(body);
}

describe("parseSpellMiss (Object.cpp:3832-3841)", () => {
  test("reads spell, caster, the count and one target with its reason", () => {
    const miss = parseSpellMiss(
      read(
        combatlogSpellMissBody({
          caster: ME,
          spellId: 122,
          targets: [{ guid: BOAR, reason: 7 }],
        }),
      ),
    );
    expect(miss).toEqual({
      caster: ME,
      spellId: 122,
      targets: [{ guid: BOAR, reason: 7 }],
    });
  });

  test("reads every target of a multi-target packet in wire order", () => {
    const miss = parseSpellMiss(
      read(
        combatlogSpellMissBody({
          caster: ME,
          spellId: 122,
          targets: [
            { guid: BOAR, reason: 2 },
            { guid: WOLF, reason: 8 },
          ],
        }),
      ),
    );
    expect(miss.targets).toEqual([
      { guid: BOAR, reason: 2 },
      { guid: WOLF, reason: 8 },
    ]);
  });

  test("a packet with no targets gives an empty list", () => {
    const miss = parseSpellMiss(
      read(combatlogSpellMissBody({ caster: ME, spellId: 5, targets: [] })),
    );
    expect(miss.targets).toEqual([]);
  });
});

describe("parseSpellImmune (Unit.cpp:6628-6633)", () => {
  test("reads caster before target, then the spell", () => {
    expect(
      parseSpellImmune(
        read(
          combatlogSpellImmuneBody({ caster: ME, spellId: 118, target: BOAR }),
        ),
      ),
    ).toEqual({ caster: ME, spellId: 118, target: BOAR });
  });
});

describe("parseDamageShield (Unit.cpp:2179-2187)", () => {
  test("reads owner, attacker, spell, damage, overkill and the school mask", () => {
    expect(
      parseDamageShield(
        read(
          combatlogDamageShieldBody({
            attacker: BOAR,
            damage: 6,
            overkill: 2,
            owner: ME,
            schoolMask: 8,
            spellId: 467,
          }),
        ),
      ),
    ).toEqual({
      attacker: BOAR,
      damage: 6,
      overkill: 2,
      owner: ME,
      schoolMask: 8,
      spellId: 467,
    });
  });

  test("the school field is a u32 mask, not a one-byte index", () => {
    const shield = parseDamageShield(
      read(
        combatlogDamageShieldBody({
          attacker: BOAR,
          damage: 1,
          owner: ME,
          schoolMask: 0x1_00,
          spellId: 467,
        }),
      ),
    );
    expect(shield.schoolMask).toBe(0x1_00);
  });
});

describe("parseEnvironmentalDamage (CombatLogPackets.cpp:22-28)", () => {
  test("reads victim, type, amount, resisted, then absorbed", () => {
    expect(
      parseEnvironmentalDamage(
        read(
          combatlogEnvironmentalDamageBody({
            absorbed: 7,
            amount: 120,
            resisted: 3,
            type: 2,
            victim: ME,
          }),
        ),
      ),
    ).toEqual({ absorbed: 7, amount: 120, resisted: 3, type: 2, victim: ME });
  });

  test("keeps the wire type for every documented value 0-5", () => {
    for (const type of [0, 1, 2, 3, 4, 5])
      expect(
        parseEnvironmentalDamage(
          read(
            combatlogEnvironmentalDamageBody({ amount: 1, type, victim: ME }),
          ),
        ).type,
      ).toBe(type);
  });
});

describe("parseInstakill (SpellEffects.cpp:294-298)", () => {
  test("reads caster, target and spell", () => {
    expect(
      parseInstakill(
        read(combatlogInstakillBody({ caster: MATE, spellId: 5, target: ME })),
      ),
    ).toEqual({ caster: MATE, spellId: 5, target: ME });
  });

  test("a self-cast keeps caster equal to target", () => {
    const kill = parseInstakill(
      read(combatlogInstakillBody({ caster: ME, spellId: 5, target: ME })),
    );
    expect(kill.caster).toBe(kill.target);
  });
});
