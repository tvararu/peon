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

export function buildListStabledPets(npc: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  return w.finish();
}

export function buildStablePet(npc: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  return w.finish();
}

export function buildUnstablePet(npc: bigint, number: number): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  w.uint32LE(number);
  return w.finish();
}

export function buildStableSwapPet(npc: bigint, number: number): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  w.uint32LE(number);
  return w.finish();
}

export function buildBuyStableSlot(npc: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  return w.finish();
}

export function buildStableRevivePet(npc: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  return w.finish();
}

export type StablePetState = "active" | "stabled" | "unknown";
export type StablePet = {
  number: number;
  entry: number;
  level: number;
  name: string;
  state: StablePetState;
};
export type StabledPets = {
  npc: bigint;
  slots: number;
  pets: readonly StablePet[];
};

const STABLE_FLAGS: Record<number, StablePetState> = {
  1: "active",
  2: "stabled",
};

export function parseStabledPets(r: PacketReader): StabledPets {
  const npc = r.uint64LE();
  const count = r.uint8();
  const slots = r.uint8();
  const pets: StablePet[] = [];
  for (let at = 0; at < count; at++) {
    const number = r.uint32LE();
    const entry = r.uint32LE();
    const level = r.uint32LE();
    const name = r.cString();
    const state = STABLE_FLAGS[r.uint8()] ?? "unknown";
    pets.push({ entry, level, name, number, state });
  }
  return { npc, pets, slots };
}

export type StableResult =
  | "money"
  | "refused"
  | "stabled"
  | "unstabled"
  | "slot_bought"
  | "exotic"
  | "unknown";

const STABLE_RESULTS: Record<number, StableResult> = {
  1: "money",
  6: "refused",
  8: "stabled",
  9: "unstabled",
  10: "slot_bought",
  12: "exotic",
};

export function parseStableResult(r: PacketReader): {
  code: number;
  result: StableResult;
} {
  const code = r.uint8();
  return { code, result: STABLE_RESULTS[code] ?? "unknown" };
}

export type PetTameFailure =
  | "invalid_creature"
  | "too_many"
  | "already_owned"
  | "not_tameable"
  | "another_summon_active"
  | "units_cant_tame"
  | "no_pet"
  | "internal_error"
  | "too_high_level"
  | "dead"
  | "not_dead"
  | "exotic"
  | "unknown_error"
  | "unknown";

const TAME_FAILURES: Record<number, PetTameFailure> = {
  1: "invalid_creature",
  2: "too_many",
  3: "already_owned",
  4: "not_tameable",
  5: "another_summon_active",
  6: "units_cant_tame",
  7: "no_pet",
  8: "internal_error",
  9: "too_high_level",
  10: "dead",
  11: "not_dead",
  12: "exotic",
  13: "unknown_error",
};

export function parsePetTameFailure(r: PacketReader): {
  code: number;
  reason: PetTameFailure;
} {
  const code = r.uint8();
  return { code, reason: TAME_FAILURES[code] ?? "unknown" };
}

function guidBody(guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  return w.finish();
}

export function buildPetAbandon(pet: bigint): Uint8Array {
  return guidBody(pet);
}

export function buildDismissCritter(critter: bigint): Uint8Array {
  return guidBody(critter);
}
