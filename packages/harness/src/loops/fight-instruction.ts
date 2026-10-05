import { DEFAULT_FIGHT_INSTRUCTION } from "#harness/loops/tactics";

export const KITE_FIGHT_INSTRUCTION =
  "kite the target: keep it outside its melee reach by slowing or rooting it and moving away, and cast when it cannot reach you";

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
