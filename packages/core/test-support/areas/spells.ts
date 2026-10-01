import { PacketWriter } from "#wow/protocol/packet";
import { PLAYER_FIELDS, UNIT_FIELDS } from "#wow/protocol/update-fields";

export function spellsChannelStartBody(init: {
  caster: bigint;
  spellId: number;
  duration: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.caster);
  w.uint32LE(init.spellId);
  w.uint32LE(init.duration);
  return w.finish();
}

export function spellsChannelUpdateBody(init: {
  caster: bigint;
  time: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.caster);
  w.uint32LE(init.time);
  return w.finish();
}

export function spellsSpellFailureBody(init: {
  caster: bigint;
  castCount: number;
  spellId: number;
  result: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.caster);
  w.uint8(init.castCount);
  w.uint32LE(init.spellId);
  w.uint8(init.result);
  return w.finish();
}

export function spellsActionButtonsBody(init: {
  state: number;
  buttons: Readonly<Record<number, number>>;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint8(init.state);
  if (init.state === 2) return w.finish();
  for (let slot = 0; slot < 144; slot++) w.uint32LE(init.buttons[slot] ?? 0);
  return w.finish();
}

export function spellsUnlearnSpellsBody(spells: readonly number[]): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(spells.length);
  for (const spellId of spells) w.uint32LE(spellId);
  return w.finish();
}

export function spellsSpellModifierBody(init: {
  eff: number;
  op: number;
  value: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint8(init.eff);
  w.uint8(init.op);
  w.uint32LE(init.value >>> 0);
  return w.finish();
}

export function spellsModifyCooldownBody(init: {
  spellId: number;
  guid: bigint;
  cooldown: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.spellId);
  w.uint64LE(init.guid);
  w.uint32LE(init.cooldown >>> 0);
  return w.finish();
}

export function spellsPlaySpellVisualBody(init: {
  guid: bigint;
  kit: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.guid);
  w.uint32LE(init.kit);
  return w.finish();
}

export const spellsPlaySpellImpactBody = spellsPlaySpellVisualBody;

export function spellsSpellStartBody(init: {
  castItem?: bigint;
  caster: bigint;
  castCount: number;
  spellId: number;
  flags: number;
  timer: number;
  target?: bigint;
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.castItem ?? init.caster);
  w.packedGuidBig(init.caster);
  w.uint8(init.castCount);
  w.uint32LE(init.spellId);
  w.uint32LE(init.flags);
  w.uint32LE(init.timer >>> 0);
  if (init.target === undefined) {
    w.uint32LE(0);
  } else {
    w.uint32LE(2);
    w.packedGuidBig(init.target);
  }
  return w.finish();
}

export function spellsSpellGoBody(init: {
  castItem?: bigint;
  caster: bigint;
  extraCasts: number;
  spellId: number;
  flags: number;
  timestamp: number;
  hits: readonly bigint[];
  target?: bigint;
  runes?: { after: number; before: number; elapsed: readonly number[] };
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.castItem ?? init.caster);
  w.packedGuidBig(init.caster);
  w.uint8(init.extraCasts);
  w.uint32LE(init.spellId);
  w.uint32LE(init.flags);
  w.uint32LE(init.timestamp);
  w.uint8(init.hits.length);
  for (const hit of init.hits) w.uint64LE(hit);
  w.uint8(0);
  if (init.target === undefined) {
    w.uint32LE(0);
  } else {
    w.uint32LE(2);
    w.packedGuidBig(init.target);
  }
  if (init.runes) {
    w.uint8(init.runes.before);
    w.uint8(init.runes.after);
    for (const byte of init.runes.elapsed) w.uint8(byte);
  }
  return w.finish();
}

export function spellsConvertRuneBody(index: number, type: number): Uint8Array {
  const w = new PacketWriter();
  w.uint8(index);
  w.uint8(type);
  return w.finish();
}

export function spellsSelfRuneFields(init: {
  classId: number;
}): Map<number, number> {
  const raw = new Map<number, number>();
  raw.set(UNIT_FIELDS.BYTES_0.offset, (init.classId & 0xff) << 8);
  const bits = new DataView(new ArrayBuffer(4));
  bits.setFloat32(0, 0.1, true);
  for (let slot = 0; slot < 4; slot++)
    raw.set(PLAYER_FIELDS.RUNE_REGEN_1.offset + slot, bits.getUint32(0, true));
  return raw;
}

export const spellsSpellFailedOtherBody = spellsSpellFailureBody;

export function spellsTotemCreatedBody(init: {
  slot: number;
  guid: bigint;
  duration: number;
  spell: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint8(init.slot);
  w.uint64LE(init.guid);
  w.uint32LE(init.duration);
  w.uint32LE(init.spell);
  return w.finish();
}

export type SkillField = {
  readonly id: number;
  readonly step: number;
  readonly value: number;
  readonly max: number;
  readonly temp: number;
  readonly perm: number;
};

export function spellsSkillFields(
  skills: readonly SkillField[],
): Map<number, number> {
  const raw = new Map<number, number>();
  for (const [slot, skill] of skills.entries()) {
    raw.set(
      PLAYER_FIELDS.SKILL_INFO.offset + slot * 3,
      ((skill.step & 0xff_ff) << 16) | (skill.id & 0xff_ff),
    );
    raw.set(
      PLAYER_FIELDS.SKILL_INFO.offset + slot * 3 + 1,
      ((skill.max & 0xff_ff) << 16) | (skill.value & 0xff_ff),
    );
    raw.set(
      PLAYER_FIELDS.SKILL_INFO.offset + slot * 3 + 2,
      (((skill.perm + 0x1_00_00) & 0xff_ff) << 16) |
        ((skill.temp + 0x1_00_00) & 0xff_ff),
    );
  }
  return raw;
}

export function spellsMirrorImageBody(init: {
  guid: bigint;
  displayId: number;
  race: number;
  gender: number;
  classId: number;
  look: readonly [number, number, number, number, number];
  guild: number;
  items: readonly number[];
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.guid);
  w.uint32LE(init.displayId);
  w.uint8(init.race);
  w.uint8(init.gender);
  w.uint8(init.classId);
  for (const byte of init.look) w.uint8(byte);
  w.uint32LE(init.guild);
  for (const item of init.items) w.uint32LE(item);
  return w.finish();
}

export function spellsProjectilePositionBody(init: {
  caster: bigint;
  castCount: number;
  x: number;
  y: number;
  z: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.caster);
  w.uint8(init.castCount);
  w.floatLE(init.x);
  w.floatLE(init.y);
  w.floatLE(init.z);
  return w.finish();
}
