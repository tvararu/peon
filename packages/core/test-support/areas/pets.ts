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
