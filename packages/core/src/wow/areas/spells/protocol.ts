import type {
  ActionButton,
  ActionButtonType,
} from "#wow/protocol/action-buttons";
import {
  type PacketReader,
  PacketWriter,
  type Vec3,
} from "#wow/protocol/packet";

const ENDLESS = 0xff_ff_ff_ff;

export type ChannelStart = {
  caster: bigint;
  spellId: number;
  durationMs: number | undefined;
};
export type ChannelUpdate = { caster: bigint; remainingMs: number };

export function parseChannelStart(r: PacketReader): ChannelStart {
  const caster = r.packedGuidBig();
  const spellId = r.uint32LE();
  const duration = r.uint32LE();
  return {
    caster,
    spellId,
    durationMs: duration === ENDLESS ? undefined : duration,
  };
}

export function parseChannelUpdate(r: PacketReader): ChannelUpdate {
  const caster = r.packedGuidBig();
  const remainingMs = r.uint32LE();
  return { caster, remainingMs };
}

export type SpellModifier = { bit: number; op: number; value: number };
export type ModifyCooldown = { spellId: number; guid: bigint; deltaMs: number };

export function parseUnlearnSpells(r: PacketReader): number[] {
  const count = r.uint32LE();
  return Array.from({ length: count }, () => r.uint32LE());
}

export function parseSpellModifier(r: PacketReader): SpellModifier {
  const bit = r.uint8();
  const op = r.uint8();
  const value = r.int32LE();
  return { bit, op, value };
}

export function parseModifyCooldown(r: PacketReader): ModifyCooldown {
  const spellId = r.uint32LE();
  const guid = r.uint64LE();
  const deltaMs = r.int32LE();
  return { spellId, guid, deltaMs };
}

export type SpellVisual = { guid: bigint; kit: number };

export function parseSpellVisual(r: PacketReader): SpellVisual {
  const guid = r.uint64LE();
  const kit = r.uint32LE();
  return { guid, kit };
}

export function buildCancelChannelling(spellId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(spellId);
  return w.finish();
}

export function buildCancelAura(spellId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(spellId);
  return w.finish();
}

export function buildCancelGrowthAura(): Uint8Array {
  return new PacketWriter().finish();
}

export type BarButton = Omit<ActionButton, "slot">;

export const ACTION_BUTTON_TYPE_CODES: Readonly<
  Record<ActionButtonType, number>
> = {
  spell: 0x00,
  equipment_set: 0x20,
  macro: 0x40,
  item: 0x80,
};

export function buildSetActionButton(
  slot: number,
  button: BarButton | undefined,
): Uint8Array {
  const w = new PacketWriter();
  w.uint8(slot);
  w.uint32LE(
    button
      ? ((button.id & 0x00_ff_ff_ff) |
          (ACTION_BUTTON_TYPE_CODES[button.type] << 24)) >>>
          0
      : 0,
  );
  return w.finish();
}

export function buildActionBarToggles(mask: number): Uint8Array {
  const w = new PacketWriter();
  w.uint8(mask);
  return w.finish();
}

export type TotemCreatedPacket = {
  slot: number;
  guid: bigint;
  durationMs: number;
  spellId: number;
};

export function parseTotemCreated(r: PacketReader): TotemCreatedPacket {
  const slot = r.uint8();
  const guid = r.uint64LE();
  const durationMs = r.uint32LE();
  const spellId = r.uint32LE();
  return { durationMs, guid, slot, spellId };
}
export type ConvertRune = { index: number; type: number };

export function parseConvertRune(r: PacketReader): ConvertRune {
  const index = r.uint8();
  const type = r.uint8();
  return { index, type };
}

export function buildTotemDestroyed(slot: number): Uint8Array {
  const w = new PacketWriter();
  w.uint8(slot);
  return w.finish();
}

export function buildUnlearnSkill(skillId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(skillId);
  return w.finish();
}

export const MIRROR_IMAGE_ITEM_SLOTS = 11;

export type MirrorImagePacket = {
  guid: bigint;
  displayId: number;
  race: number;
  gender: number;
  classId: number;
  skin: number;
  face: number;
  hairStyle: number;
  hairColor: number;
  facialHair: number;
  guild: number;
  items: readonly number[];
};

export function parseMirrorImage(r: PacketReader): MirrorImagePacket {
  const guid = r.uint64LE();
  const displayId = r.uint32LE();
  const race = r.uint8();
  const gender = r.uint8();
  const classId = r.uint8();
  const skin = r.uint8();
  const face = r.uint8();
  const hairStyle = r.uint8();
  const hairColor = r.uint8();
  const facialHair = r.uint8();
  const guild = r.uint32LE();
  const items = Array.from({ length: MIRROR_IMAGE_ITEM_SLOTS }, () =>
    r.uint32LE(),
  );
  return {
    classId,
    displayId,
    face,
    facialHair,
    gender,
    guid,
    guild,
    hairColor,
    hairStyle,
    items,
    race,
    skin,
  };
}

export function buildMirrorImageRequest(guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  return w.finish();
}

export function buildFarSight(on: boolean): Uint8Array {
  const w = new PacketWriter();
  w.uint8(on ? 1 : 0);
  return w.finish();
}

export type ProjectilePosition = {
  caster: bigint;
  castCount: number;
  x: number;
  y: number;
  z: number;
};

export function parseProjectilePosition(r: PacketReader): ProjectilePosition {
  const caster = r.uint64LE();
  const castCount = r.uint8();
  const x = r.floatLE();
  const y = r.floatLE();
  const z = r.floatLE();
  return { castCount, caster, x, y, z };
}

export function buildProjectilePosition(init: {
  caster: bigint;
  spellId: number;
  castCount: number;
  position: Vec3;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.caster);
  w.uint32LE(init.spellId);
  w.uint8(init.castCount);
  w.vec3(init.position);
  return w.finish();
}

export function buildMissileTrajectory(init: {
  caster: bigint;
  spellId: number;
  elevation: number;
  speed: number;
  current: Vec3;
  target: Vec3;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.caster);
  w.uint32LE(init.spellId);
  w.floatLE(init.elevation);
  w.floatLE(init.speed);
  w.vec3(init.current);
  w.vec3(init.target);
  w.uint8(0);
  return w.finish();
}
