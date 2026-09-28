import type { PacketReader } from "#wow/protocol/packet";

const HITINFO_UNK1 = 0x1;
const HITINFO_OFFHAND = 0x4;
const HITINFO_MISS = 0x10;
const HITINFO_ABSORB = 0x20 | 0x40;
const HITINFO_RESIST = 0x80 | 0x1_00;
const HITINFO_CRITICALHIT = 0x2_00;
const HITINFO_BLOCK = 0x20_00;
const HITINFO_GLANCING = 0x1_00_00;
const HITINFO_CRUSHING = 0x2_00_00;
const HITINFO_RAGE_GAIN = 0x80_00_00;
const UNK1_WORDS = 12;

const SPELL_HIT_TYPE_CRIT = 0x2;
const SPELL_HIT_TYPE_SPLIT = 0x8;

export const VICTIM_STATE_NAMES = [
  "intact",
  "hit",
  "dodge",
  "parry",
  "interrupt",
  "block",
  "evade",
  "immune",
  "deflect",
] as const;

export const SPELL_MISS_NAMES = [
  "none",
  "miss",
  "resist",
  "dodge",
  "parry",
  "block",
  "evade",
  "immune",
  "immune2",
  "deflect",
  "absorb",
  "reflect",
] as const;

export type SwingPart = { schoolMask: number; amount: number };

export type AttackerState = {
  hitInfo: number;
  attacker: bigint;
  target: bigint;
  total: number;
  overkill: number;
  parts: SwingPart[];
  absorbed: number[];
  resisted: number[];
  victimState: string;
  meleeSpellId: number;
  blocked?: number;
  rageGain?: number;
  crit: boolean;
  miss: boolean;
  glancing: boolean;
  crushing: boolean;
  offhand: boolean;
};

export type SpellDamage = {
  target: bigint;
  attacker: bigint;
  spellId: number;
  amount: number;
  overkill: number;
  schoolMask: number;
  absorbed: number;
  resisted: number;
  physical: boolean;
  blocked: number;
  hitFlags: number;
  crit: boolean;
  split: boolean;
};

function victimStateName(state: number): string {
  return VICTIM_STATE_NAMES[state] ?? `state${state}`;
}

function perPart(r: PacketReader, count: number, present: boolean): number[] {
  if (!present) return [];
  const values: number[] = [];
  for (let i = 0; i < count; i++) values.push(r.uint32LE());
  return values;
}

export function parseAttackerState(r: PacketReader): AttackerState {
  const hitInfo = r.uint32LE();
  const attacker = r.packedGuidBig();
  const target = r.packedGuidBig();
  const total = r.uint32LE();
  const overkill = r.uint32LE();
  const count = r.uint8();
  const parts: SwingPart[] = [];
  for (let i = 0; i < count; i++) {
    const schoolMask = r.uint32LE();
    r.floatLE();
    const amount = r.uint32LE();
    parts.push({ schoolMask, amount });
  }
  const absorbed = perPart(r, count, (hitInfo & HITINFO_ABSORB) !== 0);
  const resisted = perPart(r, count, (hitInfo & HITINFO_RESIST) !== 0);
  const victimState = victimStateName(r.uint8());
  r.uint32LE();
  const meleeSpellId = r.uint32LE();
  const blocked = hitInfo & HITINFO_BLOCK ? r.uint32LE() : undefined;
  const rageGain = hitInfo & HITINFO_RAGE_GAIN ? r.uint32LE() : undefined;
  if (hitInfo & HITINFO_UNK1) for (let i = 0; i < UNK1_WORDS; i++) r.uint32LE();
  const state: AttackerState = {
    hitInfo,
    attacker,
    target,
    total,
    overkill,
    parts,
    absorbed,
    resisted,
    victimState,
    meleeSpellId,
    crit: (hitInfo & HITINFO_CRITICALHIT) !== 0,
    miss: (hitInfo & HITINFO_MISS) !== 0,
    glancing: (hitInfo & HITINFO_GLANCING) !== 0,
    crushing: (hitInfo & HITINFO_CRUSHING) !== 0,
    offhand: (hitInfo & HITINFO_OFFHAND) !== 0,
  };
  if (blocked !== undefined) state.blocked = blocked;
  if (rageGain !== undefined) state.rageGain = rageGain;
  return state;
}

export function parseSpellDamage(r: PacketReader): SpellDamage {
  const target = r.packedGuidBig();
  const attacker = r.packedGuidBig();
  const spellId = r.uint32LE();
  const amount = r.uint32LE();
  const overkill = r.uint32LE();
  const schoolMask = r.uint8();
  const absorbed = r.uint32LE();
  const resisted = r.uint32LE();
  const physical = r.uint8() !== 0;
  r.uint8();
  const blocked = r.uint32LE();
  const hitFlags = r.uint32LE();
  r.uint8();
  return {
    target,
    attacker,
    spellId,
    amount,
    overkill,
    schoolMask,
    absorbed,
    resisted,
    physical,
    blocked,
    hitFlags,
    crit: (hitFlags & SPELL_HIT_TYPE_CRIT) !== 0,
    split: (hitFlags & SPELL_HIT_TYPE_SPLIT) !== 0,
  };
}

export type PartyKill = { killer: bigint; victim: bigint };
export type ComboPoints = { target: bigint | undefined; points: number };

export function parsePartyKill(r: PacketReader): PartyKill {
  const killer = r.uint64LE();
  const victim = r.uint64LE();
  return { killer, victim };
}

export function parseComboPoints(r: PacketReader): ComboPoints {
  const target = r.packedGuidBig();
  const points = r.uint8();
  return { target: target === 0n ? undefined : target, points };
}

export type PowerUpdate = { guid: bigint; power: number; value: number };

export function parsePowerUpdate(r: PacketReader): PowerUpdate {
  const guid = r.packedGuidBig();
  const power = r.uint8();
  const value = r.uint32LE();
  return { guid, power, value };
}
