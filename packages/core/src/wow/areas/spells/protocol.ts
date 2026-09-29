import type {
  ActionButton,
  ActionButtonType,
} from "#wow/protocol/action-buttons";
import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

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
