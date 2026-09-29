import { describe, expect, test } from "bun:test";
import {
  spellsChannelStartBody,
  spellsChannelUpdateBody,
  spellsModifyCooldownBody,
  spellsPlaySpellVisualBody,
  spellsSpellModifierBody,
  spellsTotemCreatedBody,
  spellsUnlearnSpellsBody,
} from "#test-support/areas/spells";
import {
  buildActionBarToggles,
  buildCancelAura,
  buildCancelChannelling,
  buildCancelGrowthAura,
  buildSetActionButton,
  buildTotemDestroyed,
  parseChannelStart,
  parseChannelUpdate,
  parseModifyCooldown,
  parseSpellModifier,
  parseSpellVisual,
  parseTotemCreated,
  parseUnlearnSpells,
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

describe("spells spellbook parsers", () => {
  test("SMSG_SEND_UNLEARN_SPELLS reads a u32 count and that many spell ids (Player.cpp:2885-2922)", () => {
    const reader = new PacketReader(spellsUnlearnSpellsBody([116, 205]));
    expect(parseUnlearnSpells(reader)).toEqual([116, 205]);
    expect(reader.remaining).toBe(0);
  });

  test("SMSG_SEND_UNLEARN_SPELLS with count 0 is an empty list (Player.cpp:2888-2921)", () => {
    const reader = new PacketReader(spellsUnlearnSpellsBody([]));
    expect(parseUnlearnSpells(reader)).toEqual([]);
    expect(reader.remaining).toBe(0);
  });

  test("a spell modifier reads u8 bit, u8 op and int32 value (Player.cpp:10125-10127, CharacterHandler.cpp:1244-1247)", () => {
    const reader = new PacketReader(
      spellsSpellModifierBody({ eff: 33, op: 10, value: 15 }),
    );
    expect(parseSpellModifier(reader)).toEqual({ bit: 33, op: 10, value: 15 });
    expect(reader.remaining).toBe(0);
  });

  test("a spell modifier value is signed (Player.cpp:10127)", () => {
    const body = spellsSpellModifierBody({ eff: 0, op: 14, value: -10 });
    expect([...body.slice(2)]).toEqual([0xf6, 0xff, 0xff, 0xff]);
    expect(parseSpellModifier(new PacketReader(body))).toEqual({
      bit: 0,
      op: 14,
      value: -10,
    });
  });

  test("SMSG_MODIFY_COOLDOWN reads u32 spell, u64 guid and int32 ms (Player.cpp:11284-11287)", () => {
    const body = spellsModifyCooldownBody({
      cooldown: -2000,
      guid: ME,
      spellId: 51_505,
    });
    expect(body).toHaveLength(16);
    const reader = new PacketReader(body);
    expect(parseModifyCooldown(reader)).toEqual({
      deltaMs: -2000,
      guid: ME,
      spellId: 51_505,
    });
    expect(reader.remaining).toBe(0);
  });
});

describe("spells visual parser", () => {
  test("SMSG_PLAY_SPELL_VISUAL and SMSG_PLAY_SPELL_IMPACT read a u64 guid and a u32 kit (Unit.cpp:14752-14778)", () => {
    const body = spellsPlaySpellVisualBody({ guid: MOB, kit: 179 });
    expect(body).toHaveLength(12);
    const reader = new PacketReader(body);
    expect(parseSpellVisual(reader)).toEqual({ guid: MOB, kit: 179 });
    expect(reader.remaining).toBe(0);
  });
});

describe("spells totem packets", () => {
  test("parseTotemCreated reads the u8 slot, u64 guid, u32 duration and u32 spell (TotemPackets.cpp:25-33)", () => {
    const body = spellsTotemCreatedBody({
      duration: 120_000,
      guid: MOB,
      slot: 2,
      spell: 8071,
    });
    expect(parseTotemCreated(new PacketReader(body))).toEqual({
      durationMs: 120_000,
      guid: MOB,
      slot: 2,
      spellId: 8071,
    });
  });

  test("buildTotemDestroyed writes the slot as one byte (TotemPackets.cpp:20-23)", () => {
    expect(Array.from(buildTotemDestroyed(3))).toEqual([3]);
  });
});
