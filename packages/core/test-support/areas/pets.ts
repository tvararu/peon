import { PacketWriter } from "#wow/protocol/packet";

export type PetsSlotInit = { action: number; type: number };
export type PetsCooldownInit = {
  spell: number;
  category: number;
  cooldown: number;
  categoryCooldown: number;
};
export type PetsBarInit = {
  guid: bigint;
  family: number;
  duration: number;
  react: number;
  command: number;
  flags: number;
  slots: readonly PetsSlotInit[];
  spells: readonly PetsSlotInit[];
  cooldowns: readonly PetsCooldownInit[];
};

function packed(slot: PetsSlotInit): number {
  return ((slot.action & 0xff_ff_ff) | (slot.type << 24)) >>> 0;
}

export function petsPetSpellsBody(
  init: PetsBarInit | { guid: 0n },
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.guid);
  if (!("family" in init)) return w.finish();
  w.uint16LE(init.family);
  w.uint32LE(init.duration);
  w.uint8(init.react);
  w.uint8(init.command);
  w.uint16LE(init.flags);
  for (const slot of init.slots) w.uint32LE(packed(slot));
  w.uint8(init.spells.length);
  for (const spell of init.spells) w.uint32LE(packed(spell));
  w.uint8(init.cooldowns.length);
  for (const cooldown of init.cooldowns) {
    w.uint32LE(cooldown.spell);
    w.uint16LE(cooldown.category);
    w.uint32LE(cooldown.cooldown);
    w.uint32LE(cooldown.categoryCooldown);
  }
  return w.finish();
}

export function petsPetLearnedSpellBody(init: { spell: number }): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.spell);
  return w.finish();
}

export function petsPetUnlearnedSpellBody(init: { spell: number }): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.spell);
  return w.finish();
}

export function petsPetActionFeedbackBody(init: { code: number }): Uint8Array {
  const w = new PacketWriter();
  w.uint8(init.code);
  return w.finish();
}

export function petsPetActionSoundBody(init: {
  guid: bigint;
  action: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.guid);
  w.uint32LE(init.action >>> 0);
  return w.finish();
}

export function petsPetDismissSoundBody(init: {
  modelId: number;
  x: number;
  y: number;
  z: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.modelId >>> 0);
  w.floatLE(init.x);
  w.floatLE(init.y);
  w.floatLE(init.z);
  return w.finish();
}

export function petsNameQueryResponseBody(init: {
  number: number;
  name: string;
  timestamp: number;
  declined?: readonly string[];
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.number);
  w.cString(init.name);
  w.uint32LE(init.timestamp);
  if (!init.declined) {
    w.uint8(0);
    return w.finish();
  }
  w.uint8(1);
  for (const name of init.declined) w.cString(name);
  return w.finish();
}

export function petsNameInvalidBody(init: {
  code: number;
  name: string;
  declined?: readonly string[];
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.code);
  w.cString(init.name);
  if (!init.declined) {
    w.uint8(0);
    return w.finish();
  }
  w.uint8(1);
  for (const name of init.declined) w.cString(name);
  return w.finish();
}

export type PetsStabledPetInit = {
  number: number;
  entry: number;
  level: number;
  name: string;
  flag: number;
};

export function petsStabledPetsBody(init: {
  npc: bigint;
  slots: number;
  pets: readonly PetsStabledPetInit[];
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.npc);
  w.uint8(init.pets.length);
  w.uint8(init.slots);
  for (const pet of init.pets) {
    w.uint32LE(pet.number);
    w.uint32LE(pet.entry);
    w.uint32LE(pet.level);
    w.cString(pet.name);
    w.uint8(pet.flag);
  }
  return w.finish();
}

export function petsStableResultBody(code: number): Uint8Array {
  const w = new PacketWriter();
  w.uint8(code);
  return w.finish();
}

export function petsTameFailureBody(code: number): Uint8Array {
  const w = new PacketWriter();
  w.uint8(code);
  return w.finish();
}
