import { describe, expect, test } from "bun:test";
import {
  dispelEntries,
  dispelFailedEntries,
} from "#wow/areas/combatlog/entries";

const ME = 0x2an;
const MAGE = 0xf1_30_00_3e_ea_00_0a_bcn;

describe("dispel entries", () => {
  test("one entry per dispelled aura: caster is source, victim is target, aura in extra", () => {
    const log = {
      auras: [
        { flag: 0, spellId: 168 },
        { flag: 1, spellId: 774 },
      ],
      caster: MAGE,
      spellId: 527,
      victim: ME,
    };
    expect(dispelEntries("dispel", log)).toEqual([
      {
        amount: 0,
        extra: 168,
        kind: "dispel",
        source: MAGE,
        spellId: 527,
        target: ME,
      },
      {
        amount: 0,
        extra: 774,
        kind: "dispel",
        source: MAGE,
        spellId: 527,
        target: ME,
      },
    ]);
    expect(dispelEntries("steal", log).map((e) => e.kind)).toEqual([
      "steal",
      "steal",
    ]);
  });

  test("one dispel_failed entry per failed aura with no outcome", () => {
    const entries = dispelFailedEntries({
      caster: ME,
      failed: [168, 774],
      spellId: 527,
      target: MAGE,
    });
    expect(entries.map((e) => e.extra)).toEqual([168, 774]);
    expect(
      entries.every(
        (e) => e.kind === "dispel_failed" && e.outcome === undefined,
      ),
    ).toBe(true);
    expect(entries[0]).toMatchObject({
      source: ME,
      target: MAGE,
      spellId: 527,
    });
  });
});
