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
