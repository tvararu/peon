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

export type PetNameQueryResponse = {
  number: number;
  name: string;
  timestamp: number;
  declined: readonly string[] | undefined;
};

export function buildPetNameQuery(number: number, pet: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(number);
  w.uint64LE(pet);
  return w.finish();
}

export function parsePetNameQueryResponse(
  r: PacketReader,
): PetNameQueryResponse {
  const number = r.uint32LE();
  const name = r.cString();
  const timestamp = r.uint32LE();
  const flag = r.uint8();
  const declined =
    flag === 1
      ? [r.cString(), r.cString(), r.cString(), r.cString(), r.cString()]
      : undefined;
  return { declined, name, number, timestamp };
}

export function buildPetRename(pet: bigint, name: string): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(pet);
  w.cString(name);
  w.uint8(0);
  return w.finish();
}

export type PetNameInvalidReason =
  | "success"
  | "invalid"
  | "no_name"
  | "too_short"
  | "too_long"
  | "mixed_languages"
  | "profane"
  | "reserved"
  | "three_consecutive"
  | "invalid_space"
  | "consecutive_spaces"
  | "russian_consecutive_silent_characters"
  | "russian_silent_character_at_edge"
  | "declension_mismatch"
  | "unknown";

export type PetNameInvalid = {
  code: number;
  reason: PetNameInvalidReason;
  name: string;
  declined: readonly string[] | undefined;
};

const NAME_INVALID: Record<number, PetNameInvalidReason> = {
  0: "success",
  1: "invalid",
  2: "no_name",
  3: "too_short",
  4: "too_long",
  6: "mixed_languages",
  7: "profane",
  8: "reserved",
  11: "three_consecutive",
  12: "invalid_space",
  13: "consecutive_spaces",
  14: "russian_consecutive_silent_characters",
  15: "russian_silent_character_at_edge",
  16: "declension_mismatch",
};

export function parsePetNameInvalid(r: PacketReader): PetNameInvalid {
  const code = r.uint32LE();
  const name = r.cString();
  const flag = r.uint8();
  const declined =
    flag === 1
      ? [r.cString(), r.cString(), r.cString(), r.cString(), r.cString()]
      : undefined;
  return { code, declined, name, reason: NAME_INVALID[code] ?? "unknown" };
}

export function parsePetDismissSound(r: PacketReader): PetDismissSound {
  const modelId = r.int32LE();
  const x = r.floatLE();
  const y = r.floatLE();
  const z = r.floatLE();
  return { modelId, x, y, z };
}
