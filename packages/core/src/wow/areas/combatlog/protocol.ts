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

export type SpellHeal = {
  victim: bigint;
  caster: bigint;
  spellId: number;
  heal: number;
  overheal: number;
  absorbed: number;
  crit: boolean;
};

export type SpellEnergize = {
  victim: bigint;
  caster: bigint;
  spellId: number;
  power: number;
  amount: number;
};

export type PeriodicTick =
  | {
      type: "damage";
      auraType: number;
      amount: number;
      overkill: number;
      schoolMask: number;
      absorbed: number;
      resisted: number;
      crit: boolean;
    }
  | {
      type: "heal";
      auraType: number;
      amount: number;
      overheal: number;
      absorbed: number;
      crit: boolean;
    }
  | { type: "power"; auraType: number; power: number; amount: number };

export type PeriodicAuraLog = {
  victim: bigint;
  caster: bigint;
  spellId: number;
  ticks: PeriodicTick[];
};

const AURA_PERIODIC_DAMAGE = 3;
const AURA_PERIODIC_HEAL = 8;
const AURA_OBS_MOD_HEALTH = 20;
const AURA_OBS_MOD_POWER = 21;
const AURA_PERIODIC_ENERGIZE = 24;
const AURA_PERIODIC_MANA_LEECH = 64;
const AURA_PERIODIC_DAMAGE_PERCENT = 89;

export function parseSpellHeal(r: PacketReader): SpellHeal {
  const victim = r.packedGuidBig();
  const caster = r.packedGuidBig();
  const spellId = r.uint32LE();
  const heal = r.uint32LE();
  const overheal = r.uint32LE();
  const absorbed = r.uint32LE();
  const crit = r.uint8() !== 0;
  r.uint8();
  return { victim, caster, spellId, heal, overheal, absorbed, crit };
}

export function parseSpellEnergize(r: PacketReader): SpellEnergize {
  const victim = r.packedGuidBig();
  const caster = r.packedGuidBig();
  const spellId = r.uint32LE();
  const power = r.uint32LE();
  const amount = r.uint32LE();
  return { victim, caster, spellId, power, amount };
}

function parseTick(r: PacketReader, auraType: number): PeriodicTick {
  switch (auraType) {
    case AURA_PERIODIC_DAMAGE:
    case AURA_PERIODIC_DAMAGE_PERCENT: {
      const amount = r.uint32LE();
      const overkill = r.uint32LE();
      const schoolMask = r.uint32LE();
      const absorbed = r.uint32LE();
      const resisted = r.uint32LE();
      const crit = r.uint8() !== 0;
      return {
        type: "damage",
        auraType,
        amount,
        overkill,
        schoolMask,
        absorbed,
        resisted,
        crit,
      };
    }
    case AURA_PERIODIC_HEAL:
    case AURA_OBS_MOD_HEALTH: {
      const amount = r.uint32LE();
      const overheal = r.uint32LE();
      const absorbed = r.uint32LE();
      const crit = r.uint8() !== 0;
      return { type: "heal", auraType, amount, overheal, absorbed, crit };
    }
    case AURA_OBS_MOD_POWER:
    case AURA_PERIODIC_ENERGIZE: {
      const power = r.uint32LE();
      const amount = r.uint32LE();
      return { type: "power", auraType, power, amount };
    }
    case AURA_PERIODIC_MANA_LEECH: {
      const power = r.uint32LE();
      const amount = r.uint32LE();
      r.floatLE();
      return { type: "power", auraType, power, amount };
    }
    default:
      throw new RangeError(`unknown periodic aura type ${auraType}`);
  }
}

export function parsePeriodicAuraLog(r: PacketReader): PeriodicAuraLog {
  const victim = r.packedGuidBig();
  const caster = r.packedGuidBig();
  const spellId = r.uint32LE();
  const count = r.uint32LE();
  const ticks: PeriodicTick[] = [];
  for (let i = 0; i < count; i++) ticks.push(parseTick(r, r.uint32LE()));
  return { victim, caster, spellId, ticks };
}

export type SpellMissTarget = { guid: bigint; reason: number };
export type SpellMissLog = {
  spellId: number;
  caster: bigint;
  targets: SpellMissTarget[];
};
export type SpellImmune = { caster: bigint; target: bigint; spellId: number };
export type DamageShield = {
  owner: bigint;
  attacker: bigint;
  spellId: number;
  damage: number;
  overkill: number;
  schoolMask: number;
};
export type EnvironmentalDamage = {
  victim: bigint;
  type: number;
  amount: number;
  resisted: number;
  absorbed: number;
};
export type Instakill = { caster: bigint; target: bigint; spellId: number };

export function parseSpellMiss(r: PacketReader): SpellMissLog {
  const spellId = r.uint32LE();
  const caster = r.uint64LE();
  r.uint8();
  const count = r.uint32LE();
  const targets: SpellMissTarget[] = [];
  for (let i = 0; i < count; i++)
    targets.push({ guid: r.uint64LE(), reason: r.uint8() });
  return { spellId, caster, targets };
}

export function parseSpellImmune(r: PacketReader): SpellImmune {
  const caster = r.uint64LE();
  const target = r.uint64LE();
  const spellId = r.uint32LE();
  return { caster, target, spellId };
}

export function parseDamageShield(r: PacketReader): DamageShield {
  const owner = r.uint64LE();
  const attacker = r.uint64LE();
  const spellId = r.uint32LE();
  const damage = r.uint32LE();
  const overkill = r.uint32LE();
  const schoolMask = r.uint32LE();
  return { owner, attacker, spellId, damage, overkill, schoolMask };
}

export function parseEnvironmentalDamage(r: PacketReader): EnvironmentalDamage {
  const victim = r.uint64LE();
  const type = r.uint8();
  const amount = r.uint32LE();
  const resisted = r.uint32LE();
  const absorbed = r.uint32LE();
  return { victim, type, amount, resisted, absorbed };
}

export function parseInstakill(r: PacketReader): Instakill {
  const caster = r.uint64LE();
  const target = r.uint64LE();
  const spellId = r.uint32LE();
  return { caster, target, spellId };
}
