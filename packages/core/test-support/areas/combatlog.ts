import { PacketWriter } from "#wow/protocol/packet";

export type SwingPart = {
  schoolMask: number;
  amount: number;
  absorbed?: number;
  resisted?: number;
};

const ABSORB = 0x20 | 0x40;
const RESIST = 0x80 | 0x1_00;
const BLOCK = 0x20_00;
const RAGE_GAIN = 0x80_00_00;
const UNK1 = 0x1;

type SwingInit = {
  hitInfo: number;
  attacker: bigint;
  target: bigint;
  overkill?: number;
  parts: readonly SwingPart[];
  victimState?: number;
  meleeSpellId?: number;
  blocked?: number;
  rageGain?: number;
};

function writeParts(w: PacketWriter, init: SwingInit): void {
  w.uint8(init.parts.length);
  for (const part of init.parts) {
    w.uint32LE(part.schoolMask);
    w.floatLE(part.amount);
    w.uint32LE(part.amount);
  }
  if (init.hitInfo & ABSORB)
    for (const part of init.parts) w.uint32LE(part.absorbed ?? 0);
  if (init.hitInfo & RESIST)
    for (const part of init.parts) w.uint32LE(part.resisted ?? 0);
}

function writeTail(w: PacketWriter, init: SwingInit): void {
  if (init.hitInfo & BLOCK) w.uint32LE(init.blocked ?? 0);
  if (init.hitInfo & RAGE_GAIN) w.uint32LE(init.rageGain ?? 0);
  if (!(init.hitInfo & UNK1)) return;
  w.uint32LE(0);
  for (let i = 0; i < 10; i++) w.floatLE(0);
  w.uint32LE(0);
}

export function combatlogAttackerStateBody(init: SwingInit): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.hitInfo);
  w.packedGuidBig(init.attacker);
  w.packedGuidBig(init.target);
  w.uint32LE(init.parts.reduce((sum, part) => sum + part.amount, 0));
  w.uint32LE(init.overkill ?? 0);
  writeParts(w, init);
  w.uint8(init.victimState ?? 1);
  w.uint32LE(0);
  w.uint32LE(init.meleeSpellId ?? 0);
  writeTail(w, init);
  return w.finish();
}

export function combatlogSpellDamageBody(init: {
  target: bigint;
  attacker: bigint;
  spellId: number;
  amount: number;
  overkill?: number;
  schoolMask: number;
  absorbed?: number;
  resisted?: number;
  physical?: boolean;
  blocked?: number;
  hitFlags?: number;
  debug?: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.target);
  w.packedGuidBig(init.attacker);
  w.uint32LE(init.spellId);
  w.uint32LE(init.amount);
  w.uint32LE(init.overkill ?? 0);
  w.uint8(init.schoolMask);
  w.uint32LE(init.absorbed ?? 0);
  w.uint32LE(init.resisted ?? 0);
  w.uint8(init.physical ? 1 : 0);
  w.uint8(0);
  w.uint32LE(init.blocked ?? 0);
  w.uint32LE(init.hitFlags ?? 0);
  w.uint8(init.debug ?? 0);
  return w.finish();
}

export function combatlogPartyKillBody(init: {
  killer: bigint;
  victim: bigint;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.killer);
  w.uint64LE(init.victim);
  return w.finish();
}

export function combatlogComboPointsBody(init: {
  target?: bigint;
  points: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.target ?? 0n);
  w.uint8(init.points);
  return w.finish();
}

export function combatlogPowerUpdateBody(init: {
  guid: bigint;
  power: number;
  value: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.guid);
  w.uint8(init.power);
  w.uint32LE(init.value);
  return w.finish();
}

export function combatlogSpellHealBody(init: {
  victim: bigint;
  caster: bigint;
  spellId: number;
  heal: number;
  overheal?: number;
  absorbed?: number;
  crit?: boolean;
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.victim);
  w.packedGuidBig(init.caster);
  w.uint32LE(init.spellId);
  w.uint32LE(init.heal);
  w.uint32LE(init.overheal ?? 0);
  w.uint32LE(init.absorbed ?? 0);
  w.uint8(init.crit ? 1 : 0);
  w.uint8(0);
  return w.finish();
}

export function combatlogSpellEnergizeBody(init: {
  victim: bigint;
  caster: bigint;
  spellId: number;
  power: number;
  amount: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.victim);
  w.packedGuidBig(init.caster);
  w.uint32LE(init.spellId);
  w.uint32LE(init.power);
  w.uint32LE(init.amount);
  return w.finish();
}

export type PeriodicTickInit =
  | {
      auraType: 3 | 89;
      amount: number;
      overkill?: number;
      schoolMask: number;
      absorbed?: number;
      resisted?: number;
      crit?: boolean;
    }
  | {
      auraType: 8 | 20;
      amount: number;
      overheal: number;
      absorbed?: number;
      crit?: boolean;
    }
  | { auraType: 21 | 24; power: number; amount: number }
  | { auraType: 64; power: number; amount: number; multiplier: number }
  | { auraType: 4 };

type DamageTick = Extract<PeriodicTickInit, { auraType: 3 | 89 }>;
type HealTick = Extract<PeriodicTickInit, { auraType: 8 | 20 }>;
type PowerTick = Extract<PeriodicTickInit, { auraType: 21 | 24 | 64 }>;

function writeDamageTick(w: PacketWriter, tick: DamageTick): void {
  w.uint32LE(tick.amount);
  w.uint32LE(tick.overkill ?? 0);
  w.uint32LE(tick.schoolMask);
  w.uint32LE(tick.absorbed ?? 0);
  w.uint32LE(tick.resisted ?? 0);
  w.uint8(tick.crit ? 1 : 0);
}

function writeHealTick(w: PacketWriter, tick: HealTick): void {
  w.uint32LE(tick.amount);
  w.uint32LE(tick.overheal);
  w.uint32LE(tick.absorbed ?? 0);
  w.uint8(tick.crit ? 1 : 0);
}

function writePowerTick(w: PacketWriter, tick: PowerTick): void {
  w.uint32LE(tick.power);
  w.uint32LE(tick.amount);
  if (tick.auraType === 64) w.floatLE(tick.multiplier);
}

function writeTick(w: PacketWriter, tick: PeriodicTickInit): void {
  w.uint32LE(tick.auraType);
  if ("schoolMask" in tick) writeDamageTick(w, tick);
  else if ("overheal" in tick) writeHealTick(w, tick);
  else if ("power" in tick) writePowerTick(w, tick);
}

export function combatlogPeriodicAuraLogBody(init: {
  victim: bigint;
  caster: bigint;
  spellId: number;
  count?: number;
  tick: PeriodicTickInit;
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.victim);
  w.packedGuidBig(init.caster);
  w.uint32LE(init.spellId);
  w.uint32LE(init.count ?? 1);
  writeTick(w, init.tick);
  return w.finish();
}

export function combatlogSpellMissBody(init: {
  spellId: number;
  caster: bigint;
  targets: readonly { guid: bigint; reason: number }[];
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.spellId);
  w.uint64LE(init.caster);
  w.uint8(0);
  w.uint32LE(init.targets.length);
  for (const target of init.targets) {
    w.uint64LE(target.guid);
    w.uint8(target.reason);
  }
  return w.finish();
}

export function combatlogSpellImmuneBody(init: {
  caster: bigint;
  target: bigint;
  spellId: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.caster);
  w.uint64LE(init.target);
  w.uint32LE(init.spellId);
  w.uint8(0);
  return w.finish();
}

export function combatlogDamageShieldBody(init: {
  owner: bigint;
  attacker: bigint;
  spellId: number;
  damage: number;
  overkill?: number;
  schoolMask: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.owner);
  w.uint64LE(init.attacker);
  w.uint32LE(init.spellId);
  w.uint32LE(init.damage);
  w.uint32LE(init.overkill ?? 0);
  w.uint32LE(init.schoolMask);
  return w.finish();
}

export function combatlogEnvironmentalDamageBody(init: {
  victim: bigint;
  type: number;
  amount: number;
  resisted?: number;
  absorbed?: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.victim);
  w.uint8(init.type);
  w.uint32LE(init.amount);
  w.uint32LE(init.resisted ?? 0);
  w.uint32LE(init.absorbed ?? 0);
  return w.finish();
}

export function combatlogInstakillBody(init: {
  caster: bigint;
  target: bigint;
  spellId: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.caster);
  w.uint64LE(init.target);
  w.uint32LE(init.spellId);
  return w.finish();
}

export function combatlogSpellGoBody(init: {
  caster: bigint;
  spellId: number;
  hits?: readonly bigint[];
  misses?: readonly { guid: bigint; reason: number; reflect?: number }[];
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.caster);
  w.packedGuidBig(init.caster);
  w.uint8(0);
  w.uint32LE(init.spellId);
  w.uint32LE(0);
  w.uint32LE(0);
  const hits = init.hits ?? [];
  w.uint8(hits.length);
  for (const guid of hits) w.uint64LE(guid);
  const misses = init.misses ?? [];
  w.uint8(misses.length);
  for (const miss of misses) {
    w.uint64LE(miss.guid);
    w.uint8(miss.reason);
    if (miss.reason === 11) w.uint8(miss.reflect ?? 0);
  }
  w.uint32LE(0);
  return w.finish();
}

export function combatlogDispelLogBody(init: {
  victim: bigint;
  caster: bigint;
  spellId: number;
  auras: readonly { spellId: number; flag?: number }[];
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.victim);
  w.packedGuidBig(init.caster);
  w.uint32LE(init.spellId);
  w.uint8(0);
  w.uint32LE(init.auras.length);
  for (const aura of init.auras) {
    w.uint32LE(aura.spellId);
    w.uint8(aura.flag ?? 0);
  }
  return w.finish();
}

export function combatlogDispelFailedBody(init: {
  caster: bigint;
  target: bigint;
  spellId: number;
  failed: readonly number[];
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.caster);
  w.uint64LE(init.target);
  w.uint32LE(init.spellId);
  for (const id of init.failed) w.uint32LE(id);
  return w.finish();
}
