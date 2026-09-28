import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  spellsPlaySpellImpactBody,
  spellsPlaySpellVisualBody,
} from "#test-support/areas/spells";
import type { SpellsEvent } from "#wow/areas/spells/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x2an;
const TRAINER = 0xf1_30_00_3e_d7_00_1a_2bn;
const CAST_DIRECTED = 179;
const EMOTE_SALUTE = 362;

function setup() {
  const rig = areaRig("spells", { now: () => 1000, selfGuid: ME });
  const seen: SpellsEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return { rig, seen };
}

describe("spells visual wiring", () => {
  test("a trainer purchase emits the npc visual and the impact on self and keeps no state (Trainer.cpp:111-112)", () => {
    const { rig, seen } = setup();
    try {
      const before = rig.handle.state();
      rig.inject(
        GameOpcode.SMSG_PLAY_SPELL_VISUAL,
        spellsPlaySpellVisualBody({ guid: TRAINER, kit: CAST_DIRECTED }),
      );
      rig.inject(
        GameOpcode.SMSG_PLAY_SPELL_IMPACT,
        spellsPlaySpellImpactBody({ guid: ME, kit: EMOTE_SALUTE }),
      );
      expect(seen).toEqual([
        {
          guid: TRAINER,
          impact: false,
          kit: CAST_DIRECTED,
          type: "spell_visual",
        },
        { guid: ME, impact: true, kit: EMOTE_SALUTE, type: "spell_visual" },
      ]);
      expect(rig.handle.state()).toEqual(before);
    } finally {
      rig.dispose();
    }
  });
});
