import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  combatlogPeriodicAuraLogBody,
  combatlogSpellEnergizeBody,
  combatlogSpellHealBody,
} from "#test-support/areas/combatlog";
import type { CombatlogEvent } from "#wow/areas/combatlog/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x2an;
const MATE = 0x2bn;
const BOAR = 0xf1_30_00_3e_ea_00_0a_bcn;

function rigWithEvents() {
  const rig = areaRig("combatlog", { now: () => 50, selfGuid: ME });
  const seen: CombatlogEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return { rig, seen };
}

describe("combatlog heal wiring", () => {
  test("SMSG_SPELLHEALLOG adds one heal entry and counts the effective heal", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_SPELLHEALLOG,
        combatlogSpellHealBody({
          caster: MATE,
          crit: true,
          heal: 540,
          overheal: 40,
          spellId: 2050,
          victim: ME,
        }),
      );
      expect(rig.handle.state().entries).toEqual([
        {
          amount: 500,
          at: 50,
          crit: true,
          kind: "heal",
          over: 40,
          source: MATE,
          spellId: 2050,
          target: ME,
        },
      ]);
      expect(seen.map((event) => event.type)).toEqual(["entry"]);
      expect(rig.handle.state().fight?.healed).toBe(500);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_SPELLENERGIZELOG adds one energize entry that keeps mana power 0", () => {
    const { rig } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_SPELLENERGIZELOG,
        combatlogSpellEnergizeBody({
          amount: 150,
          caster: ME,
          power: 0,
          spellId: 2455,
          victim: ME,
        }),
      );
      expect(rig.handle.state().entries).toEqual([
        {
          amount: 150,
          at: 50,
          kind: "energize",
          power: 0,
          source: ME,
          spellId: 2455,
          target: ME,
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_PERIODICAURALOG adds one entry per tick family", () => {
    const { rig } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_PERIODICAURALOG,
        combatlogPeriodicAuraLogBody({
          caster: BOAR,
          spellId: 133,
          tick: { amount: 12, auraType: 3, schoolMask: 4 },
          victim: ME,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_PERIODICAURALOG,
        combatlogPeriodicAuraLogBody({
          caster: MATE,
          spellId: 774,
          tick: { amount: 30, auraType: 8, overheal: 5 },
          victim: ME,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_PERIODICAURALOG,
        combatlogPeriodicAuraLogBody({
          caster: MATE,
          spellId: 5,
          tick: { amount: 9, auraType: 24, power: 0 },
          victim: ME,
        }),
      );
      expect(rig.handle.state().entries.map((e) => e.kind)).toEqual([
        "periodic_damage",
        "periodic_heal",
        "periodic_power",
      ]);
      expect(rig.handle.state().entries[1]?.amount).toBe(25);
    } finally {
      rig.dispose();
    }
  });

  test("a periodic tick from an empty caster is still logged", () => {
    const { rig } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_PERIODICAURALOG,
        combatlogPeriodicAuraLogBody({
          caster: 0n,
          spellId: 133,
          tick: { amount: 12, auraType: 3, schoolMask: 4 },
          victim: ME,
        }),
      );
      expect(rig.handle.state().entries).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("a heal between two other units is dropped", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_SPELLHEALLOG,
        combatlogSpellHealBody({
          caster: MATE,
          heal: 100,
          spellId: 2050,
          victim: BOAR,
        }),
      );
      expect(rig.handle.state().entries).toEqual([]);
      expect(seen).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});
