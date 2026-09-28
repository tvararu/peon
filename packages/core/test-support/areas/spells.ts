import { PacketWriter } from "#wow/protocol/packet";

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
