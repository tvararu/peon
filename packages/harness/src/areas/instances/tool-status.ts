import type { AreaState } from "@peon/core";

export type InstancesSnapshot = AreaState<"instances">;
export type LfgSnapshot = AreaState<"lfg">;
export type RaidLockView = NonNullable<InstancesSnapshot["locks"]>[number];
export type QueueView = NonNullable<LfgSnapshot["queue"]>;

export const LOCKS_STALE_MS = 5 * 60_000;

function left(lock: RaidLockView, elapsedSeconds: number): string {
  const seconds = Math.max(0, lock.secondsToReset - elapsedSeconds);
  if (seconds >= 86_400) return `${Math.round(seconds / 86_400)} d`;
  if (seconds >= 3600) return `${Math.round(seconds / 3600)} h`;
  return `${Math.ceil(seconds / 60)} min`;
}

const DUNGEON_NAME: Readonly<Record<number, string>> = {
  0: "normal",
  1: "heroic",
};
const RAID_NAME: Readonly<Record<number, string>> = {
  0: "10-normal",
  1: "25-normal",
  2: "10-heroic",
  3: "25-heroic",
};

export function difficultyName(
  kind: "dungeon" | "raid",
  value: number,
): string {
  const names = kind === "dungeon" ? DUNGEON_NAME : RAID_NAME;
  return names[value] ?? `difficulty ${value}`;
}

export function liveSaves(
  instances: InstancesSnapshot,
  now: number,
): { lock: RaidLockView; left: string }[] {
  const elapsed = (now - (instances.locksAt ?? now)) / 1000;
  return (instances.locks ?? [])
    .map((lock) => ({ left: left(lock, elapsed), lock }))
    .filter(({ left: text }) => text !== "0 min");
}

export function saveLine({
  left,
  lock,
}: {
  left: string;
  lock: RaidLockView;
}): string {
  const held = lock.extended ? ", extended" : "";
  return `map ${lock.mapId} (difficulty ${lock.difficulty}), ${left} left${held}`;
}

export function lockStale(instances: InstancesSnapshot, now: number): boolean {
  const at = instances.locksAt;
  if (at === undefined) return true;
  return now - at > LOCKS_STALE_MS;
}

export function difficultyLines(
  instances: InstancesSnapshot,
  now: number,
): string[] {
  const dungeon =
    instances.dungeonDifficulty === undefined
      ? "Dungeon difficulty: unknown."
      : `Dungeon difficulty: ${difficultyName("dungeon", instances.dungeonDifficulty)}.`;
  const raid =
    instances.raidDifficulty === undefined
      ? "Raid difficulty: unknown."
      : `Raid difficulty: ${difficultyName("raid", instances.raidDifficulty)}.`;
  const map = instances.mapDifficulty;
  const here =
    map === undefined
      ? "Not in a dungeon or raid map."
      : map.difficulty === 0
        ? `Here: map ${map.mapId} (normal).`
        : `Here: map ${map.mapId} (${map.name ?? `difficulty ${map.difficulty}`}).`;
  const saves = liveSaves(instances, now)
    .map(saveLine)
    .map((line) => `  ${line}`);
  return [
    dungeon,
    raid,
    here,
    ...(saves.length > 0
      ? ["Saved instances:", ...saves]
      : ["No saved instances."]),
  ];
}
