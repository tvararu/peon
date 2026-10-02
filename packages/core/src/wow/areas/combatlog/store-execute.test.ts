import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { combatlogSpellExecuteBody } from "#test-support/areas/combatlog";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x2an;

describe("execute utility behaviour", () => {
  test("an ours execute entry leaves the fight unset and advances the timer", () => {
    const rig = areaRig("combatlog", { now: () => 50, selfGuid: ME });
    try {
      rig.inject(
        GameOpcode.SMSG_SPELLLOGEXECUTE,
        combatlogSpellExecuteBody({
          caster: ME,
          effects: [{ effect: 24, records: [{ entry: 5350 }] }],
          spellId: 5504,
        }),
      );
      expect(rig.handle.state().fight).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });
});
