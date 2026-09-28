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
