import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  combatlogDispelFailedBody,
  combatlogDispelLogBody,
} from "#test-support/areas/combatlog";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x2an;
const MAGE = 0xf1_30_00_3e_ea_00_0a_bcn;

function kindsAfter(opcode: number, body: Uint8Array) {
  const rig = areaRig("combatlog", { now: () => 50, selfGuid: ME });
  try {
    rig.inject(opcode, body);
    return rig.handle.state().entries;
  } finally {
    rig.dispose();
  }
}

describe("dispel opcodes", () => {
  const log = combatlogDispelLogBody({
    auras: [{ spellId: 168 }, { spellId: 774 }],
    caster: MAGE,
    spellId: 527,
    victim: ME,
  });

  test("SMSG_SPELLDISPELLOG adds one dispel entry per aura", () => {
    const entries = kindsAfter(GameOpcode.SMSG_SPELLDISPELLOG, log);
    expect(entries.map((e) => [e.kind, e.extra])).toEqual([
      ["dispel", 168],
      ["dispel", 774],
    ]);
    expect(entries[0]).toMatchObject({
      source: MAGE,
      target: ME,
      spellId: 527,
    });
  });

  test("SMSG_SPELLSTEALLOG adds steal entries", () => {
    const entries = kindsAfter(GameOpcode.SMSG_SPELLSTEALLOG, log);
    expect(entries.map((e) => e.kind)).toEqual(["steal", "steal"]);
  });

  test("SMSG_DISPEL_FAILED adds one dispel_failed entry per failed aura", () => {
    const entries = kindsAfter(
      GameOpcode.SMSG_DISPEL_FAILED,
      combatlogDispelFailedBody({
        caster: MAGE,
        failed: [168, 774, 1459],
        spellId: 527,
        target: ME,
      }),
    );
    expect(entries.map((e) => [e.kind, e.extra])).toEqual([
      ["dispel_failed", 168],
      ["dispel_failed", 774],
      ["dispel_failed", 1459],
    ]);
  });
});
