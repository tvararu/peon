import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  combatlogDamageShieldBody,
  combatlogEnvironmentalDamageBody,
  combatlogInstakillBody,
  combatlogSpellGoBody,
  combatlogSpellImmuneBody,
  combatlogSpellMissBody,
} from "#test-support/areas/combatlog";
import type { CombatlogEvent } from "#wow/areas/combatlog/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x2an;
const MATE = 0x2bn;
const BOAR = 0xf1_30_00_3e_ea_00_0a_bcn;
const WOLF = 0xf1_30_00_3e_eb_00_0a_bdn;
const BOAR_ENTRY = 0x3e_ea;

function rigWithEvents() {
  const rig = areaRig("combatlog", { now: () => 50, selfGuid: ME });
  const seen: CombatlogEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return { rig, seen };
}

describe("combatlog miss and immunity wiring", () => {
  test("SMSG_SPELLLOGMISS gives one miss entry per target with source, target, spell and outcome", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_SPELLLOGMISS,
        combatlogSpellMissBody({
          caster: ME,
          spellId: 122,
          targets: [
            { guid: BOAR, reason: 2 },
            { guid: WOLF, reason: 6 },
          ],
        }),
      );
      expect(rig.handle.state().entries).toEqual([
        {
          amount: 0,
          at: 50,
          kind: "miss",
          outcome: "resist",
          source: ME,
          spellId: 122,
          target: BOAR,
        },
        {
          amount: 0,
          at: 50,
          kind: "miss",
          outcome: "evade",
          source: ME,
          spellId: 122,
          target: WOLF,
        },
      ]);
      expect(seen.map((event) => event.type)).toEqual(["entry", "entry"]);
      expect(rig.handle.state().fight?.misses).toEqual({ evade: 1, resist: 1 });
    } finally {
      rig.dispose();
    }
  });

  test("a reason outside the table is named unknown_<n>", () => {
    const { rig } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_SPELLLOGMISS,
        combatlogSpellMissBody({
          caster: ME,
          spellId: 122,
          targets: [{ guid: BOAR, reason: 99 }],
        }),
      );
      expect(rig.handle.state().entries[0]?.outcome).toBe("unknown_99");
    } finally {
      rig.dispose();
    }
  });

  test("an IMMUNE miss of the character's spell counts as immune and remembers the creature entry", () => {
    const { rig } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_SPELLLOGMISS,
        combatlogSpellMissBody({
          caster: ME,
          spellId: 122,
          targets: [{ guid: BOAR, reason: 7 }],
        }),
      );
      rig.inject(
        GameOpcode.SMSG_SPELLLOGMISS,
        combatlogSpellMissBody({
          caster: ME,
          spellId: 122,
          targets: [{ guid: BOAR, reason: 8 }],
        }),
      );
      const state = rig.handle.state();
      expect(state.fight?.misses).toEqual({ immune: 1, immune2: 1 });
      expect(state.immunities).toEqual([
        { at: 50, entry: BOAR_ENTRY, spellId: 122 },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_SPELLORDAMAGE_IMMUNE adds an immune entry with caster first, and an immunity", () => {
    const { rig } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_SPELLORDAMAGE_IMMUNE,
        combatlogSpellImmuneBody({ caster: ME, spellId: 118, target: BOAR }),
      );
      expect(rig.handle.state().entries).toEqual([
        {
          amount: 0,
          at: 50,
          kind: "immune",
          outcome: "immune",
          source: ME,
          spellId: 118,
          target: BOAR,
        },
      ]);
      expect(rig.handle.state().immunities).toEqual([
        { at: 50, entry: BOAR_ENTRY, spellId: 118 },
      ]);
      expect(rig.handle.state().fight?.misses).toEqual({ immune: 1 });
    } finally {
      rig.dispose();
    }
  });

  test("an immune result against the character is kept but is not an immunity of a creature", () => {
    const { rig } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_SPELLORDAMAGE_IMMUNE,
        combatlogSpellImmuneBody({ caster: BOAR, spellId: 118, target: ME }),
      );
      expect(rig.handle.state().entries).toHaveLength(1);
      expect(rig.handle.state().immunities).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});

describe("combatlog SMSG_SPELL_GO miss list", () => {
  test("an IMMUNE result for the character's cast adds a miss entry and an immunity", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_SPELL_GO,
        combatlogSpellGoBody({
          caster: ME,
          hits: [WOLF],
          misses: [{ guid: BOAR, reason: 7 }],
          spellId: 122,
        }),
      );
      expect(rig.handle.state().entries).toEqual([
        {
          amount: 0,
          at: 50,
          kind: "miss",
          outcome: "immune",
          source: ME,
          spellId: 122,
          target: BOAR,
        },
      ]);
      expect(rig.handle.state().immunities).toEqual([
        { at: 50, entry: BOAR_ENTRY, spellId: 122 },
      ]);
      expect(seen.map((event) => event.type)).toEqual(["entry"]);
    } finally {
      rig.dispose();
    }
  });

  test("a plain miss and a reflect entry both map, and the reflect byte does not shift the next entry", () => {
    const { rig } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_SPELL_GO,
        combatlogSpellGoBody({
          caster: ME,
          misses: [
            { guid: BOAR, reason: 11, reflect: 1 },
            { guid: WOLF, reason: 1 },
          ],
          spellId: 133,
        }),
      );
      expect(
        rig.handle.state().entries.map((e) => [e.target, e.outcome]),
      ).toEqual([
        [BOAR, "reflect"],
        [WOLF, "miss"],
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a stranger's cast against a stranger is dropped and counted", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_SPELL_GO,
        combatlogSpellGoBody({
          caster: MATE,
          misses: [{ guid: BOAR, reason: 7 }],
          spellId: 122,
        }),
      );
      expect(rig.handle.state().entries).toEqual([]);
      expect(rig.handle.state().dropped).toBe(1);
      expect(seen).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a cast with an empty miss list adds nothing", () => {
    const { rig } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_SPELL_GO,
        combatlogSpellGoBody({ caster: ME, hits: [BOAR], spellId: 122 }),
      );
      expect(rig.handle.state().entries).toEqual([]);
      expect(rig.handle.state().dropped).toBe(0);
    } finally {
      rig.dispose();
    }
  });
});

describe("combatlog shield, environment and instakill wiring", () => {
  test("SMSG_SPELLDAMAGESHIELD is damage from the owner to the attacker and counts as dealt", () => {
    const { rig } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_SPELLDAMAGESHIELD,
        combatlogDamageShieldBody({
          attacker: BOAR,
          damage: 6,
          overkill: 2,
          owner: ME,
          schoolMask: 8,
          spellId: 467,
        }),
      );
      expect(rig.handle.state().entries).toEqual([
        {
          amount: 6,
          at: 50,
          kind: "damage_shield",
          over: 2,
          schoolMask: 8,
          source: ME,
          spellId: 467,
          target: BOAR,
        },
      ]);
      expect(rig.handle.state().fight?.dealt).toBe(6);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_ENVIRONMENTAL_DAMAGE_LOG keeps the wire type, also 0, and counts as taken", () => {
    const { rig } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_ENVIRONMENTAL_DAMAGE_LOG,
        combatlogEnvironmentalDamageBody({
          absorbed: 4,
          amount: 120,
          resisted: 3,
          type: 2,
          victim: ME,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_ENVIRONMENTAL_DAMAGE_LOG,
        combatlogEnvironmentalDamageBody({ amount: 9, type: 0, victim: ME }),
      );
      const state = rig.handle.state();
      expect(state.entries).toEqual([
        {
          absorbed: 4,
          amount: 120,
          at: 50,
          extra: 2,
          kind: "environmental",
          resisted: 3,
          source: 0n,
          target: ME,
        },
        {
          amount: 9,
          at: 50,
          extra: 0,
          kind: "environmental",
          source: 0n,
          target: ME,
        },
      ]);
      expect(state.fight?.taken).toBe(129);
      expect(state.fight?.misses).toEqual({});
    } finally {
      rig.dispose();
    }
  });

  test("environmental damage to another player is dropped", () => {
    const { rig } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_ENVIRONMENTAL_DAMAGE_LOG,
        combatlogEnvironmentalDamageBody({ amount: 9, type: 2, victim: MATE }),
      );
      expect(rig.handle.state().entries).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_SPELLINSTAKILLLOG adds an instakill entry from caster to target", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_SPELLINSTAKILLLOG,
        combatlogInstakillBody({ caster: BOAR, spellId: 5, target: ME }),
      );
      expect(rig.handle.state().entries).toEqual([
        {
          amount: 0,
          at: 50,
          kind: "instakill",
          source: BOAR,
          spellId: 5,
          target: ME,
        },
      ]);
      expect(seen.map((event) => event.type)).toEqual(["entry"]);
    } finally {
      rig.dispose();
    }
  });
});
