import { existsSync } from "node:fs";
import { join } from "node:path";

const MAP_NAMES: ReadonlyMap<number, string> = new Map([
  [0, "Azeroth"],
  [1, "Kalimdor"],
  [530, "Expansion01"],
  [571, "Northrend"],
]);

export function navigationMapName(mapId: number): string | undefined {
  return MAP_NAMES.get(mapId);
}

export function requireNavigationMapName(mapId: number): string {
  const name = navigationMapName(mapId);
  if (name === undefined)
    throw new Error(`unsupported map ${mapId} (no navigation map name)`);
  return name;
}

export function hasNavigationData(dataPath: string, mapId: number): boolean {
  const name = navigationMapName(mapId);
  return name !== undefined && existsSync(join(dataPath, `${name}.map`));
}
