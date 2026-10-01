import { describe, expect, test } from "bun:test";
import {
  combatlogDispelFailedBody,
  combatlogDispelLogBody,
} from "#test-support/areas/combatlog";
import {
  parseDispelFailed,
  parseDispelLog,
} from "#wow/areas/combatlog/protocol";
import { PacketReader } from "#wow/protocol/packet";

const ME = 0x2an;
const MAGE = 0xf1_30_00_3e_ea_00_0a_bcn;

describe("parseDispelLog (SpellEffects.cpp:2803-2817, :5990-6002)", () => {
  test("reads victim, caster, dispel spell and one id per aura", () => {
    const log = parseDispelLog(
      new PacketReader(
        combatlogDispelLogBody({
          auras: [{ spellId: 168 }, { flag: 1, spellId: 774 }],
          caster: MAGE,
          spellId: 527,
          victim: ME,
        }),
      ),
    );
    expect(log).toEqual({
      auras: [
        { flag: 0, spellId: 168 },
        { flag: 1, spellId: 774 },
      ],
      caster: MAGE,
      spellId: 527,
      victim: ME,
    });
  });

  test("a count of zero yields no auras", () => {
    const log = parseDispelLog(
      new PacketReader(
        combatlogDispelLogBody({
          auras: [],
          caster: ME,
          spellId: 527,
          victim: MAGE,
        }),
      ),
    );
    expect(log.auras).toEqual([]);
    expect(log.victim).toBe(MAGE);
  });
});

describe("parseDispelFailed (SpellEffects.cpp:2779-2787)", () => {
  test("reads full guids, the dispel spell and every failed aura to the end", () => {
    const failed = parseDispelFailed(
      new PacketReader(
        combatlogDispelFailedBody({
          caster: ME,
          failed: [168, 774, 1459],
          spellId: 527,
          target: MAGE,
        }),
      ),
    );
    expect(failed).toEqual({
      caster: ME,
      failed: [168, 774, 1459],
      spellId: 527,
      target: MAGE,
    });
  });

  test("a body with no failed aura yields an empty list", () => {
    const failed = parseDispelFailed(
      new PacketReader(
        combatlogDispelFailedBody({
          caster: ME,
          failed: [],
          spellId: 527,
          target: MAGE,
        }),
      ),
    );
    expect(failed.failed).toEqual([]);
  });
});
