export const DUNGEON_DIFFICULTY = {
  normal: 0,
  heroic: 1,
  epic: 2,
} as const;

export const RAID_DIFFICULTY = {
  "10-normal": 0,
  "25-normal": 1,
  "10-heroic": 2,
  "25-heroic": 3,
} as const;

export type DungeonDifficulty = keyof typeof DUNGEON_DIFFICULTY;
export type RaidDifficulty = keyof typeof RAID_DIFFICULTY;
export type DifficultyKind = "dungeon" | "raid";

const byValue = (names: Record<string, number>) =>
  new Map(Object.entries(names).map(([name, value]) => [value, name]));

const NAMES: Record<DifficultyKind, ReadonlyMap<number, string>> = {
  dungeon: byValue(DUNGEON_DIFFICULTY),
  raid: byValue(RAID_DIFFICULTY),
};

export function difficultyName(
  kind: "dungeon",
  value: number,
): DungeonDifficulty | undefined;
export function difficultyName(
  kind: "raid",
  value: number,
): RaidDifficulty | undefined;
export function difficultyName(
  kind: DifficultyKind,
  value: number,
): DungeonDifficulty | RaidDifficulty | undefined;
export function difficultyName(
  kind: DifficultyKind,
  value: number,
): string | undefined {
  return NAMES[kind].get(value);
}
