import { describe, expect, test } from "bun:test";
import {
  combatlogAttackerStateBody,
  combatlogComboPointsBody,
  combatlogPartyKillBody,
  combatlogPowerUpdateBody,
  combatlogSpellDamageBody,
} from "#test-support/areas/combatlog";
import {
  parseAttackerState,
  parseComboPoints,
  parsePartyKill,
  parsePowerUpdate,
  parseSpellDamage,
  SPELL_MISS_NAMES,
} from "#wow/areas/combatlog/protocol";
import { PacketReader } from "#wow/protocol/packet";

const ME = 0x2an;
const BOAR = 0xf1_30_00_3e_ea_00_0a_bcn;

function read(body: Uint8Array) {
  return new PacketReader(body);
}

describe("parseAttackerState (Unit.cpp:6661-6720)", () => {
  test("a plain hit reads one part and no optional fields", () => {
    const r = read(
      combatlogAttackerStateBody({
        attacker: ME,
        hitInfo: 0x2,
        parts: [{ amount: 17, schoolMask: 1 }],
        target: BOAR,
      }),
    );
    expect(parseAttackerState(r)).toEqual({
      hitInfo: 0x2,
      attacker: ME,
      target: BOAR,
      total: 17,
      overkill: 0,
      parts: [{ schoolMask: 1, amount: 17 }],
      absorbed: [],
      resisted: [],
      victimState: "hit",
      meleeSpellId: 0,
      crit: false,
      miss: false,
      glancing: false,
      crushing: false,
      offhand: false,
    });
    expect(r.remaining).toBe(0);
  });

  test("the hand-written wire bytes of a crit read as the writer wrote them", () => {
    const bytes = new Uint8Array([
      0x02, 0x02, 0x00, 0x00, 0x01, 0x2a, 0x01, 0xbc, 0x28, 0x00, 0x00, 0x00,
      0x05, 0x00, 0x00, 0x00, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x20,
      0x42, 0x28, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00,
    ]);
    expect(parseAttackerState(read(bytes))).toMatchObject({
      attacker: ME,
      crit: true,
      overkill: 5,
      parts: [{ amount: 40, schoolMask: 1 }],
      target: 0xbcn,
      total: 40,
      victimState: "hit",
    });
  });

  test("a partial absorb reads one absorb per part", () => {
    const parsed = parseAttackerState(
      read(
        combatlogAttackerStateBody({
          attacker: BOAR,
          hitInfo: 0x2 | 0x40,
          parts: [{ absorbed: 6, amount: 11, schoolMask: 1 }],
          target: ME,
        }),
      ),
    );
    expect(parsed.absorbed).toEqual([6]);
    expect(parsed.resisted).toEqual([]);
  });

  test("a two-part swing with absorb and resist reads two of each (Unit.cpp:6677-6691)", () => {
    const r = read(
      combatlogAttackerStateBody({
        attacker: BOAR,
        hitInfo: 0x2 | 0x20 | 0x1_00,
        parts: [
          { absorbed: 3, amount: 20, resisted: 0, schoolMask: 1 },
          { absorbed: 1, amount: 8, resisted: 4, schoolMask: 4 },
        ],
        target: ME,
        victimState: 1,
      }),
    );
    const parsed = parseAttackerState(r);
    expect(parsed).toMatchObject({
      absorbed: [3, 1],
      parts: [
        { amount: 20, schoolMask: 1 },
        { amount: 8, schoolMask: 4 },
      ],
      resisted: [0, 4],
      total: 28,
    });
    expect(r.remaining).toBe(0);
  });

  test("HITINFO_BLOCK reads the blocked amount", () => {
    const parsed = parseAttackerState(
      read(
        combatlogAttackerStateBody({
          attacker: ME,
          blocked: 9,
          hitInfo: 0x2 | 0x20_00,
          parts: [{ amount: 2, schoolMask: 1 }],
          target: BOAR,
        }),
      ),
    );
    expect(parsed.blocked).toBe(9);
  });

  test("HITINFO_RAGE_GAIN reads one extra word and UNK19 reads none (Unit.cpp:6700-6701)", () => {
    const rage = read(
      combatlogAttackerStateBody({
        attacker: ME,
        hitInfo: 0x2 | 0x80_00_00,
        parts: [{ amount: 2, schoolMask: 1 }],
        rageGain: 7,
        target: BOAR,
      }),
    );
    expect(parseAttackerState(rage).rageGain).toBe(7);
    expect(rage.remaining).toBe(0);
    const unk19 = read(
      combatlogAttackerStateBody({
        attacker: ME,
        hitInfo: 0x2 | 0x8_00_00,
        parts: [{ amount: 2, schoolMask: 1 }],
        target: BOAR,
      }),
    );
    expect(parseAttackerState(unk19).rageGain).toBeUndefined();
    expect(unk19.remaining).toBe(0);
  });

  test("HITINFO_UNK1 reads and drops the debug block (Unit.cpp:6704-6717)", () => {
    const r = read(
      combatlogAttackerStateBody({
        attacker: ME,
        hitInfo: 0x2 | 0x1,
        parts: [{ amount: 2, schoolMask: 1 }],
        target: BOAR,
      }),
    );
    expect(parseAttackerState(r).total).toBe(2);
    expect(r.remaining).toBe(0);
  });

  test("a dodge reads the victim state and the derived flags", () => {
    const parsed = parseAttackerState(
      read(
        combatlogAttackerStateBody({
          attacker: ME,
          hitInfo: 0x10 | 0x4 | 0x1_00_00 | 0x2_00_00,
          parts: [{ amount: 0, schoolMask: 1 }],
          target: BOAR,
          victimState: 2,
        }),
      ),
    );
    expect(parsed).toMatchObject({
      crushing: true,
      glancing: true,
      miss: true,
      offhand: true,
      victimState: "dodge",
    });
  });

  test("a short body throws", () => {
    const body = combatlogAttackerStateBody({
      attacker: ME,
      hitInfo: 0x2,
      parts: [{ amount: 2, schoolMask: 1 }],
      target: BOAR,
    });
    expect(() => parseAttackerState(read(body.slice(0, -3)))).toThrow();
  });
});

describe("parseSpellDamage (Unit.cpp:6470-6483)", () => {
  test("reads the school mask, the SPELL_HIT_TYPE flags and the debug byte", () => {
    const r = read(
      combatlogSpellDamageBody({
        absorbed: 2,
        amount: 31,
        attacker: ME,
        blocked: 0,
        debug: 0x1,
        hitFlags: 0x2 | 0x8 | 0x1,
        overkill: 4,
        physical: false,
        resisted: 3,
        schoolMask: 4,
        spellId: 133,
        target: BOAR,
      }),
    );
    expect(parseSpellDamage(r)).toEqual({
      target: BOAR,
      attacker: ME,
      spellId: 133,
      amount: 31,
      overkill: 4,
      schoolMask: 4,
      absorbed: 2,
      resisted: 3,
      physical: false,
      blocked: 0,
      hitFlags: 0x0b,
      crit: true,
      split: true,
    });
    expect(r.remaining).toBe(0);
  });

  test("a plain hit is no crit and no split", () => {
    const parsed = parseSpellDamage(
      read(
        combatlogSpellDamageBody({
          amount: 12,
          attacker: BOAR,
          physical: true,
          schoolMask: 1,
          spellId: 6268,
          target: ME,
        }),
      ),
    );
    expect(parsed).toMatchObject({ crit: false, physical: true, split: false });
  });

  test("a short body throws", () => {
    const body = combatlogSpellDamageBody({
      amount: 12,
      attacker: BOAR,
      schoolMask: 1,
      spellId: 6268,
      target: ME,
    });
    expect(() => parseSpellDamage(read(body.slice(0, -6)))).toThrow();
  });
});

test("SPELL_MISS_NAMES follows SharedDefines.h:1523-1534", () => {
  expect(SPELL_MISS_NAMES).toEqual([
    "none",
    "miss",
    "resist",
    "dodge",
    "parry",
    "block",
    "evade",
    "immune",
    "immune2",
    "deflect",
    "absorb",
    "reflect",
  ]);
});

describe("parsePartyKill (Unit.cpp:13583-13585)", () => {
  test("reads the killer and the victim as two full guids", () => {
    const body = combatlogPartyKillBody({ killer: ME, victim: BOAR });
    expect(body).toEqual(
      new Uint8Array([
        0x2a, 0, 0, 0, 0, 0, 0, 0, 0xbc, 0x0a, 0x00, 0xea, 0x3e, 0x00, 0x30,
        0xf1,
      ]),
    );
    expect(parsePartyKill(read(body))).toEqual({ killer: ME, victim: BOAR });
  });

  test("reads a body the server sent after a mage killed an Angershade", () => {
    const body = Uint8Array.from(
      Buffer.from("d10d000000000000334601283d0030f1", "hex"),
    );
    expect(parsePartyKill(read(body))).toEqual({
      killer: 0xdd1n,
      victim: 0xf1_30_00_3d_28_01_46_33n,
    });
  });

  test("reads the body of the combatlog-fight kill proof", () => {
    const body = Uint8Array.from(
      Buffer.from("060e000000000000084801283d0030f1", "hex"),
    );
    expect(parsePartyKill(read(body))).toEqual({
      killer: 0xe06n,
      victim: 0xf1_30_00_3d_28_01_48_08n,
    });
  });

  test("a short body throws", () => {
    const body = combatlogPartyKillBody({ killer: ME, victim: BOAR });
    expect(() => parsePartyKill(read(body.slice(0, 12)))).toThrow();
  });
});

describe("parseComboPoints (Unit.cpp:12851-12857)", () => {
  test("reads the packed target guid and the points", () => {
    expect(
      parseComboPoints(
        read(combatlogComboPointsBody({ points: 3, target: BOAR })),
      ),
    ).toEqual({ points: 3, target: BOAR });
  });

  test("an empty packed guid (one 0 byte) gives no target", () => {
    expect(parseComboPoints(read(new Uint8Array([0x00, 0x00])))).toEqual({
      points: 0,
      target: undefined,
    });
    expect(combatlogComboPointsBody({ points: 0 })).toEqual(
      new Uint8Array([0x00, 0x00]),
    );
  });
});

describe("parsePowerUpdate (Unit.cpp:12015-12019)", () => {
  test("reads the packed guid, the power index and the value", () => {
    expect(
      parsePowerUpdate(
        read(new Uint8Array([0x01, 0x2a, 0x01, 0x64, 0x00, 0x00, 0x00])),
      ),
    ).toEqual({ guid: ME, power: 1, value: 100 });
  });

  test("the builder writes the same layout", () => {
    expect(
      parsePowerUpdate(
        read(combatlogPowerUpdateBody({ guid: BOAR, power: 0, value: 312 })),
      ),
    ).toEqual({ guid: BOAR, power: 0, value: 312 });
    expect(
      combatlogPowerUpdateBody({ guid: ME, power: 1, value: 100 }),
    ).toEqual(new Uint8Array([0x01, 0x2a, 0x01, 0x64, 0x00, 0x00, 0x00]));
  });

  test("parses the bodies the server sent in a live mage run", () => {
    const hex = (text: string) => Uint8Array.from(Buffer.from(text, "hex"));
    expect(parsePowerUpdate(read(hex("030f0e0059020000")))).toEqual({
      guid: 0xe0fn,
      power: 0,
      value: 601,
    });
    expect(parsePowerUpdate(read(hex("df6b5b01283d30f10000000000")))).toEqual({
      guid: 0xf1_30_00_3d_28_01_5b_6bn,
      power: 0,
      value: 0,
    });
  });
});
