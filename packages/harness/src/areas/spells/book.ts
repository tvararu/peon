import type { SpellDefinition } from "@peon/core";
import type { Game } from "#harness/loops/game";

export type SpellRef = { id: number; name: string };

const WHOLE_NUMBER = /^\d+$/;
const DIGITS = /\d+/;

function rankNumber(spell: SpellDefinition): number {
  const digits = DIGITS.exec(spell.rank)?.[0];
  return digits === undefined ? 0 : Number(digits);
}

export async function visibleSpellbook(
  handle: Game,
): Promise<SpellDefinition[]> {
  const hidden = handle.spells.state().inactiveRanks;
  const book = await handle.getSpellbook();
  return book.filter((spell) => !hidden.includes(spell.id));
}

export function spellName(handle: Game, id: number): string {
  return handle.spellDefinition(id)?.name ?? `spell ${id}`;
}

export function wholeNumber(text: string): number | undefined {
  const wanted = text.trim();
  return WHOLE_NUMBER.test(wanted) ? Number(wanted) : undefined;
}

export async function knownSpell(
  handle: Game,
  text: string,
): Promise<SpellRef | undefined> {
  const id = wholeNumber(text);
  if (id !== undefined) {
    const state = handle.getCombatState();
    const learned =
      state.learned.includes(id) || state.unknownLearned.includes(id);
    return learned ? { id, name: spellName(handle, id) } : undefined;
  }
  const wanted = text.trim().toLowerCase();
  const matches = (await visibleSpellbook(handle))
    .filter((spell) => spell.name.toLowerCase() === wanted)
    .sort((a, b) => rankNumber(b) - rankNumber(a));
  const best = matches.at(0);
  return best && { id: best.id, name: best.name };
}
