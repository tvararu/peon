import {
  type DbcFile,
  type DbcSource,
  i32,
  localeString,
  openDbc,
  u32,
} from "#wow/dbc";

export type FactionEntry = {
  id: number;
  repListId: number | undefined;
  baseRepRaceMask: readonly number[];
  baseRepClassMask: readonly number[];
  baseRepValue: readonly number[];
  reputationFlags: readonly number[];
  team: number;
  name: string;
};

export const RANK_NAMES = [
  "Hated",
  "Hostile",
  "Unfriendly",
  "Neutral",
  "Friendly",
  "Honored",
  "Revered",
  "Exalted",
] as const;

const POINTS_IN_RANK = [36_000, 3000, 3000, 3000, 6000, 12_000, 21_000, 1000];
const REPUTATION_CAP = 42_999;
const REPUTATION_BOTTOM = -42_000;
const ALL_PLAYABLE_RACES = 1791;

const LAYOUT = { file: "Faction.dbc", fields: 57, recordSize: 228 } as const;

export function rankOf(standing: number): number {
  let limit = REPUTATION_CAP + 1;
  for (let rank = POINTS_IN_RANK.length - 1; rank >= 0; rank--) {
    limit -= POINTS_IN_RANK[rank] ?? 0;
    if (standing >= limit) return rank;
  }
  return 0;
}

export function rankBounds(rank: number): { floor: number; ceiling: number } {
  let floor = REPUTATION_BOTTOM;
  for (let i = 0; i < rank; i++) floor += POINTS_IN_RANK[i] ?? 0;
  return { floor, ceiling: floor + (POINTS_IN_RANK[rank] ?? 0) - 1 };
}

function quad(file: DbcFile, row: number, start: number, signed = false) {
  const read = signed ? i32 : u32;
  return [0, 1, 2, 3].map((i) => read(file, row, start + i));
}

function decode(file: DbcFile, row: number): FactionEntry {
  const repListId = i32(file, row, 1);
  return {
    id: u32(file, row, 0),
    repListId: repListId >= 0 ? repListId : undefined,
    baseRepRaceMask: quad(file, row, 2),
    baseRepClassMask: quad(file, row, 6),
    baseRepValue: quad(file, row, 10, true),
    reputationFlags: quad(file, row, 14),
    team: u32(file, row, 18),
    name: localeString(file, row, 23),
  };
}

function slotMatches(
  faction: FactionEntry,
  slot: number,
  raceMask: number,
  classMask: number,
): boolean {
  const races = faction.baseRepRaceMask[slot] ?? 0;
  const classes = faction.baseRepClassMask[slot] ?? 0;
  const raceOk = (races & raceMask) !== 0 || (races === 0 && classes !== 0);
  return raceOk && ((classes & classMask) !== 0 || classes === 0);
}

export class FactionCatalog {
  private readonly byId = new Map<number, FactionEntry>();
  private readonly byList = new Map<number, FactionEntry>();

  constructor(file: DbcFile) {
    for (let row = 0; row < file.recordCount; row++) {
      const entry = decode(file, row);
      this.byId.set(entry.id, entry);
      if (entry.repListId !== undefined)
        this.byList.set(entry.repListId, entry);
    }
  }

  byRepListId(repListId: number): FactionEntry | undefined {
    return this.byList.get(repListId);
  }

  byFactionId(id: number): FactionEntry | undefined {
    return this.byId.get(id);
  }

  baseReputation(
    faction: FactionEntry,
    raceMask: number,
    classMask: number,
  ): number {
    for (let slot = 0; slot < 4; slot++)
      if (slotMatches(faction, slot, raceMask, classMask))
        return faction.baseRepValue[slot] ?? 0;
    return 0;
  }

  canBeSetAtWar(faction: FactionEntry): boolean {
    return (
      faction.repListId !== undefined &&
      faction.baseRepRaceMask[0] === ALL_PLAYABLE_RACES
    );
  }
}

export async function loadFactionCatalog(
  source: DbcSource,
): Promise<FactionCatalog> {
  return new FactionCatalog(await openDbc(source, LAYOUT));
}
