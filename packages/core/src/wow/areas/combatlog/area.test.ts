import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  combatlogAttackerStateBody,
  combatlogSpellDamageBody,
} from "#test-support/areas/combatlog";
import type { CombatlogEvent } from "#wow/areas/combatlog/store";
import { areaStubs } from "#wow/areas/compose";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x2an;
const BOAR = 0xf1_30_00_3e_ea_00_0a_bcn;

function rigWithEvents() {
  const rig = areaRig("combatlog", { now: () => 50, selfGuid: ME });
  const seen: CombatlogEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return { rig, seen };
}

describe("combatlog area wiring", () => {
  test("SMSG_ATTACKERSTATEUPDATE adds one melee entry and emits one entry event", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_ATTACKERSTATEUPDATE,
        combatlogAttackerStateBody({
          attacker: BOAR,
          hitInfo: 0x2,
          parts: [{ amount: 9, schoolMask: 1 }],
          target: ME,
        }),
      );
      expect(rig.handle.state().entries).toEqual([
        {
          amount: 9,
          at: 50,
          kind: "melee",
          schoolMask: 1,
          source: BOAR,
          target: ME,
        },
      ]);
      expect(seen.map((event) => event.type)).toEqual(["entry"]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_SPELLNONMELEEDAMAGELOG adds one spell_damage entry", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_SPELLNONMELEEDAMAGELOG,
        combatlogSpellDamageBody({
          amount: 31,
          attacker: ME,
          schoolMask: 4,
          spellId: 133,
          target: BOAR,
        }),
      );
      expect(rig.handle.state().entries).toEqual([
        {
          amount: 31,
          at: 50,
          kind: "spell_damage",
          schoolMask: 4,
          source: ME,
          spellId: 133,
          target: BOAR,
        },
      ]);
      expect(seen).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("the entry events reach the world event bus", () => {
    const { rig } = rigWithEvents();
    const areas: string[] = [];
    rig.events.area.subscribe(({ area, event }) =>
      areas.push(`${area}/${event.type}`),
    );
    try {
      rig.inject(
        GameOpcode.SMSG_SPELLNONMELEEDAMAGELOG,
        combatlogSpellDamageBody({
          amount: 1,
          attacker: ME,
          schoolMask: 4,
          spellId: 133,
          target: BOAR,
        }),
      );
      expect(areas).toEqual(["combatlog/entry"]);
    } finally {
      rig.dispose();
    }
  });

  test("the two damage logs are no longer stubs", () => {
    const stubbed = areaStubs().map(([opcode]) => opcode);
    expect(stubbed).not.toContain(GameOpcode.SMSG_ATTACKERSTATEUPDATE);
    expect(stubbed).not.toContain(GameOpcode.SMSG_SPELLNONMELEEDAMAGELOG);
  });
});
