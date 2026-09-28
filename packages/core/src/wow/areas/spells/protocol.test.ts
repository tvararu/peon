import { describe, expect, test } from "bun:test";
import {
  spellsChannelStartBody,
  spellsChannelUpdateBody,
} from "#test-support/areas/spells";
import {
  buildActionBarToggles,
  buildCancelAura,
  buildCancelChannelling,
  buildCancelGrowthAura,
  buildSetActionButton,
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

describe("spells action bar builders", () => {
  test.each([
    ["spell", 133, 133],
    ["spell", 0x1_23_45, 0x00_01_23_45],
    ["item", 6948, 0x80_00_1b_24],
    ["macro", 3, 0x40_00_00_03],
    ["equipment_set", 1, 0x20_00_00_01],
  ] as const)(
    "CMSG_SET_ACTION_BUTTON packs a %s %p as u8 slot and u32 id | type << 24 (MiscHandler.cpp:899-938, Player.h:222-236)",
    (type, id, packed) => {
      const reader = new PacketReader(buildSetActionButton(11, { id, type }));
      expect(reader.uint8()).toBe(11);
      expect(reader.uint32LE()).toBe(packed);
      expect(reader.remaining).toBe(0);
    },
  );

  test("CMSG_SET_ACTION_BUTTON with no button writes 0, which removes it (MiscHandler.cpp:909-913)", () => {
    const reader = new PacketReader(buildSetActionButton(143, undefined));
    expect(reader.uint8()).toBe(143);
    expect(reader.uint32LE()).toBe(0);
    expect(reader.remaining).toBe(0);
  });

  test("CMSG_SET_ACTIONBAR_TOGGLES is one u8 mask (MiscHandler.cpp:952-965)", () => {
    const reader = new PacketReader(buildActionBarToggles(15));
    expect(reader.uint8()).toBe(15);
    expect(reader.remaining).toBe(0);
  });
});
