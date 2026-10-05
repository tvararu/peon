import { DEFAULT_FIGHT_INSTRUCTION } from "#harness/loops/tactics";

export const KITE_FIGHT_INSTRUCTION =
  "kite the target: open from range with a spell that slows it, then keep it outside its melee reach and inside your spell range; move away only while it is closing in, and when it is not closing, stand and cast; root it if it gets close; do not move away before it has been pulled";

export function fightInstruction(
  how: string | undefined,
  kite: boolean | undefined,
): string {
  const base = how ?? DEFAULT_FIGHT_INSTRUCTION;
  return kite ? `${base}; ${KITE_FIGHT_INSTRUCTION}` : base;
}

export function isKiteInstruction(instruction: string): boolean {
  return instruction.includes(KITE_FIGHT_INSTRUCTION);
}
