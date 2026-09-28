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
