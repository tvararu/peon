import { describe, expect, test } from "bun:test";
import {
  spellsChannelStartBody,
  spellsChannelUpdateBody,
} from "#test-support/areas/spells";
import {
  buildCancelAura,
  buildCancelChannelling,
  buildCancelGrowthAura,
  parseChannelStart,
  parseChannelUpdate,
} from "#wow/areas/spells/protocol";
import { PacketReader } from "#wow/protocol/packet";

const ME = 0x2an;
const MOB = 0xf1_30_00_3e_ea_00_0a_bcn;
const ARCANE_MISSILES = 5143;
const FROST_ARMOR = 168;

describe("spells channel parsers", () => {
  test("MSG_CHANNEL_START reads caster, spell and duration (Spell.cpp:5362-5385)", () => {
    const body = spellsChannelStartBody({
      caster: ME,
      duration: 3000,
      spellId: ARCANE_MISSILES,
    });
    const reader = new PacketReader(body);
    expect(parseChannelStart(reader)).toEqual({
      caster: ME,
      durationMs: 3000,
      spellId: ARCANE_MISSILES,
    });
    expect(reader.remaining).toBe(0);
  });

  test("MSG_CHANNEL_START with duration 0xFFFFFFFF is an endless channel (Spell.cpp:4247-4250)", () => {
    const body = spellsChannelStartBody({
      caster: MOB,
      duration: 0xff_ff_ff_ff,
      spellId: 12_345,
    });
    expect(parseChannelStart(new PacketReader(body))).toEqual({
      caster: MOB,
      durationMs: undefined,
      spellId: 12_345,
    });
  });

  test("MSG_CHANNEL_UPDATE reads caster and remaining time (Spell.cpp:5342-5359)", () => {
    const body = spellsChannelUpdateBody({ caster: ME, time: 2250 });
    const reader = new PacketReader(body);
    expect(parseChannelUpdate(reader)).toEqual({
      caster: ME,
      remainingMs: 2250,
    });
    expect(reader.remaining).toBe(0);
  });
});

describe("spells channel builders", () => {
  test("CMSG_CANCEL_CHANNELLING is one uint32 spell id (SpellHandler.cpp:653-684)", () => {
    const reader = new PacketReader(buildCancelChannelling(ARCANE_MISSILES));
    expect(reader.uint32LE()).toBe(ARCANE_MISSILES);
    expect(reader.remaining).toBe(0);
  });
});

describe("spells aura builders", () => {
  test("CMSG_CANCEL_AURA is one uint32 spell id (SpellHandler.cpp:568-601)", () => {
    const reader = new PacketReader(buildCancelAura(FROST_ARMOR));
    expect(reader.uint32LE()).toBe(FROST_ARMOR);
    expect(reader.remaining).toBe(0);
  });

  test("CMSG_CANCEL_GROWTH_AURA has an empty body (SpellHandler.cpp:642-644)", () => {
    expect(buildCancelGrowthAura()).toHaveLength(0);
  });
});
