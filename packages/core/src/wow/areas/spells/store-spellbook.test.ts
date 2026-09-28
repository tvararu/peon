import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  spellsModifyCooldownBody,
  spellsSpellModifierBody,
  spellsUnlearnSpellsBody,
} from "#test-support/areas/spells";
import type { SpellsEvent } from "#wow/areas/spells/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x2an;
const OTHER = 0x2bn;
const RIPTIDE = 61_295;
const SPELLMOD_COOLDOWN = 11;
const SPELLMOD_COST = 14;

function setup() {
  let now = 1000;
  const rig = areaRig("spells", { now: () => now, selfGuid: ME });
  const seen: SpellsEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  const flat = (eff: number, op: number, value: number) =>
    rig.inject(
      GameOpcode.SMSG_SET_FLAT_SPELL_MODIFIER,
      spellsSpellModifierBody({ eff, op, value }),
    );
  const pct = (eff: number, op: number, value: number) =>
    rig.inject(
      GameOpcode.SMSG_SET_PCT_SPELL_MODIFIER,
      spellsSpellModifierBody({ eff, op, value }),
    );
  const modify = (cooldown: number, guid = ME) =>
    rig.inject(
      GameOpcode.SMSG_MODIFY_COOLDOWN,
      spellsModifyCooldownBody({ cooldown, guid, spellId: RIPTIDE }),
    );
  return {
    advance: (ms: number) => {
      now += ms;
    },
    flat,
    modify,
    pct,
    rig,
    seen,
  };
}

describe("spells spellbook housekeeping", () => {
  test("each SMSG_SEND_UNLEARN_SPELLS replaces the inactive ranks (Player.cpp:2885-2922, 11795)", () => {
    const { rig, seen } = setup();
    try {
      expect(rig.handle.state().inactiveRanks).toEqual([]);
      rig.inject(
        GameOpcode.SMSG_SEND_UNLEARN_SPELLS,
        spellsUnlearnSpellsBody([116, 205]),
      );
      expect(rig.handle.state().inactiveRanks).toEqual([116, 205]);
      rig.inject(
        GameOpcode.SMSG_SEND_UNLEARN_SPELLS,
        spellsUnlearnSpellsBody([837]),
      );
      expect(rig.handle.state().inactiveRanks).toEqual([837]);
      expect(seen).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a modifier packet sets the total for its op and bit, and the last one wins (Player.cpp:10112-10127)", () => {
    const { flat, pct, rig, seen } = setup();
    try {
      expect(rig.handle.state().modifiers).toEqual({ flat: {}, pct: {} });
      flat(3, SPELLMOD_COST, -10);
      flat(3, SPELLMOD_COST, -25);
      flat(40, SPELLMOD_COOLDOWN, -2000);
      pct(3, SPELLMOD_COST, 15);
      expect(rig.handle.state().modifiers).toEqual({
        flat: {
          [SPELLMOD_COOLDOWN]: { 40: -2000 },
          [SPELLMOD_COST]: { 3: -25 },
        },
        pct: { [SPELLMOD_COST]: { 3: 15 } },
      });
      expect(seen).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a modifier total of 0 removes the bit, as a login resend skips it (Player.cpp:10124-10127, CharacterHandler.cpp:1241-1242)", () => {
    const { pct, rig } = setup();
    try {
      pct(3, SPELLMOD_COST, 15);
      pct(4, SPELLMOD_COST, 5);
      pct(3, SPELLMOD_COST, 0);
      expect(rig.handle.state().modifiers.pct).toEqual({
        [SPELLMOD_COST]: { 4: 5 },
      });
      pct(4, SPELLMOD_COST, 0);
      expect(rig.handle.state().modifiers.pct).toEqual({});
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_MODIFY_COOLDOWN for self moves the server cooldown by the signed delta (Player.cpp:11275-11288)", () => {
    const { modify, rig, seen } = setup();
    try {
      rig.stores.combat.applyInitialSpells({
        cooldowns: [
          {
            category: 0,
            categoryCooldown: 0,
            cooldown: 6000,
            itemId: 0,
            spellId: RIPTIDE,
          },
        ],
        spells: [{ spellId: RIPTIDE }],
      });
      modify(-2000);
      expect(rig.stores.combat.readyAt(RIPTIDE)).toBe(5000);
      expect(rig.stores.combat.record(undefined).cooldowns).toEqual([
        { remainingMs: 4000, source: "server", spellId: RIPTIDE, until: 5000 },
      ]);
      modify(-2000, OTHER);
      expect(rig.stores.combat.readyAt(RIPTIDE)).toBe(5000);
      expect(seen).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_MODIFY_COOLDOWN for a spell with no cooldown creates none (Player.cpp:11277-11279)", () => {
    const { modify, rig } = setup();
    try {
      modify(5000);
      expect(rig.stores.combat.readyAt(RIPTIDE)).toBe(0);
    } finally {
      rig.dispose();
    }
  });
});
