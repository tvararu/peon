import { PLAYER_FIELDS } from "#wow/protocol/update-fields";

export const MAX_TITLE_INDEX = 192;

const KNOWN_BASE = PLAYER_FIELDS.KNOWN_TITLES.offset;

export type KnownTitles = { known: number[]; chosen: number };

export function readTitles(
  rawFields: ReadonlyMap<number, number>,
): KnownTitles {
  const known: number[] = [];
  for (let bit = 0; bit < MAX_TITLE_INDEX; bit += 1) {
    const word = rawFields.get(KNOWN_BASE + (bit >> 5)) ?? 0;
    if ((word & (1 << (bit % 32))) !== 0) known.push(bit);
  }
  return {
    chosen: rawFields.get(PLAYER_FIELDS.CHOSEN_TITLE.offset) ?? 0,
    known,
  };
}
