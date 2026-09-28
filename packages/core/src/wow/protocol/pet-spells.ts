import type { PacketReader } from "#wow/protocol/packet";

export const PET_BAR_SLOTS = 10;
const INFINITE_COOLDOWN = 0x80_00_00_00;

export type PetSlot = { action: number; type: number };
export type PetCooldown = {
  spell: number;
  category: number;
  cooldownMs: number;
  categoryCooldownMs: number;
  infinite: boolean;
};
export type PetBar = {
  guid: bigint;
  family: number;
  durationMs: number;
  react: number;
  command: number;
  flags: number;
  slots: PetSlot[];
  spells: PetSlot[];
  cooldowns: PetCooldown[];
};
export type PetBarClear = { guid: 0n };

function slot(r: PacketReader): PetSlot {
  const value = r.uint32LE();
  return { action: value & 0xff_ff_ff, type: value >>> 24 };
}

function cooldown(r: PacketReader): PetCooldown {
  const spell = r.uint32LE();
  const category = r.uint16LE();
  const cooldownMs = r.uint32LE();
  const categoryCooldownMs = r.uint32LE();
  return {
    spell,
    category,
    cooldownMs,
    categoryCooldownMs,
    infinite: categoryCooldownMs === INFINITE_COOLDOWN,
  };
}

export function isPetBarClear(bar: PetBar | PetBarClear): bar is PetBarClear {
  return !("family" in bar);
}

export function parsePetSpells(r: PacketReader): PetBar | PetBarClear {
  const guid = r.uint64LE();
  if (guid === 0n) return { guid: 0n };
  const family = r.uint16LE();
  const durationMs = r.uint32LE();
  const react = r.uint8();
  const command = r.uint8();
  const flags = r.uint16LE();
  const slots = Array.from({ length: PET_BAR_SLOTS }, () => slot(r));
  const spellCount = r.uint8();
  const spells = Array.from({ length: spellCount }, () => slot(r));
  const cooldownCount = r.uint8();
  const cooldowns = Array.from({ length: cooldownCount }, () => cooldown(r));
  return {
    guid,
    family,
    durationMs,
    react,
    command,
    flags,
    slots,
    spells,
    cooldowns,
  };
}
