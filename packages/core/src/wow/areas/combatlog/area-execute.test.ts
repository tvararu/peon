import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { combatlogSpellExecuteBody } from "#test-support/areas/combatlog";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x2an;
const WITCH = 0xf1_30_00_3e_d5_00_0a_bcn;

describe("SMSG_SPELLLOGEXECUTE", () => {
  test("creates one execute entry per record", () => {
    const rig = areaRig("combatlog", { now: () => 50, selfGuid: ME });
    try {
      rig.inject(
        GameOpcode.SMSG_SPELLLOGEXECUTE,
        combatlogSpellExecuteBody({
          caster: ME,
          effects: [
            {
              effect: 68,
              records: [
                { guid: WITCH, spell: 332 },
                { guid: ME, spell: 403 },
              ],
            },
            { effect: 24, records: [{ entry: 5350 }] },
          ],
          spellId: 9999,
        }),
      );
      const entries = rig.handle.state().entries;
      expect(entries).toEqual([
        {
          at: 50,
          kind: "execute",
          source: ME,
          target: WITCH,
          spellId: 9999,
          amount: 332,
          extra: 68,
        },
        {
          at: 50,
          kind: "execute",
          source: ME,
          target: ME,
          spellId: 9999,
          amount: 403,
          extra: 68,
        },
        {
          at: 50,
          kind: "execute",
          source: ME,
          target: 0n,
          spellId: 9999,
          amount: 5350,
          extra: 24,
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a truncated log still stores the records read and counts dropped", () => {
    const rig = areaRig("combatlog", { now: () => 50, selfGuid: ME });
    try {
      rig.inject(
        GameOpcode.SMSG_SPELLLOGEXECUTE,
        combatlogSpellExecuteBody({
          caster: ME,
          effects: [
            { effect: 24, records: [{ entry: 5350 }] },
            { effect: 999, records: [{ raw: new Uint8Array([1, 2, 3, 4]) }] },
          ],
          spellId: 9999,
        }),
      );
      const state = rig.handle.state();
      expect(state.dropped).toBe(1);
      expect(state.entries).toEqual([
        {
          at: 50,
          kind: "execute",
          source: ME,
          target: 0n,
          spellId: 9999,
          amount: 5350,
          extra: 24,
        },
      ]);
      expect(state.fight).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });
});
