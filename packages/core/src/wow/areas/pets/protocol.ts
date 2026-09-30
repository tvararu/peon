import { type PacketReader, PacketWriter } from "#wow/protocol/packet";
import type { SpellTarget } from "#wow/protocol/spell-targets";
import { writeSpellTargets } from "#wow/protocol/spell-targets";

export const PET_ACTION = { command: 0x07, reaction: 0x06 } as const;

export type PetFeedback =
  | "pet_dead"
  | "nothing_to_attack"
  | "cant_attack"
  | "unknown";
export type PetActionSound = { guid: bigint; action: number };
export type PetDismissSound = {
  modelId: number;
  x: number;
  y: number;
  z: number;
};

const FEEDBACK: readonly PetFeedback[] = [
  "unknown",
  "pet_dead",
  "nothing_to_attack",
  "cant_attack",
];

export function parsePetSpellId(r: PacketReader): number {
  return r.uint32LE();
}

export function buildRequestPetInfo(): Uint8Array {
  return new Uint8Array();
}

export function buildPetAction(
  pet: bigint,
  type: number,
  action: number,
  target: bigint,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(pet);
  w.uint32LE(((type << 24) | (action & 0xff_ff_ff)) >>> 0);
  w.uint64LE(target);
  return w.finish();
}

export function buildPetStopAttack(pet: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(pet);
  return w.finish();
}

export type PetSetActionPair = { slot: number; packed: number };

export function buildPetCastSpell(
  pet: bigint,
  castCount: number,
  spell: number,
  target: SpellTarget,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(pet);
  w.uint8(castCount);
  w.uint32LE(spell);
  w.uint8(0);
  writeSpellTargets(w, target);
  return w.finish();
}

export function buildPetSpellAutocast(
  pet: bigint,
  spell: number,
  on: boolean,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(pet);
  w.uint32LE(spell);
  w.uint8(on ? 1 : 0);
  return w.finish();
}

export function buildPetSetAction(
  pet: bigint,
  pairs:
    | readonly [PetSetActionPair]
    | readonly [PetSetActionPair, PetSetActionPair],
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(pet);
  for (const pair of pairs) {
    w.uint32LE(pair.slot);
    w.uint32LE(pair.packed >>> 0);
  }
  return w.finish();
}

export function buildPetCancelAura(pet: bigint, spell: number): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(pet);
  w.uint32LE(spell);
  return w.finish();
}
export function parsePetActionFeedback(r: PacketReader): PetFeedback {
  return FEEDBACK[r.uint8()] ?? "unknown";
}

export function parsePetActionSound(r: PacketReader): PetActionSound {
  const guid = r.uint64LE();
  const action = r.int32LE();
  return { guid, action };
}

export function parsePetDismissSound(r: PacketReader): PetDismissSound {
  const modelId = r.int32LE();
  const x = r.floatLE();
  const y = r.floatLE();
  const z = r.floatLE();
  return { modelId, x, y, z };
}
