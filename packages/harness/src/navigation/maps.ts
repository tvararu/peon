import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  NavigationDataMissing,
  openNativeMap,
} from "#harness/navigation/namigator";
import type { NativeMap, NavigationSource } from "#harness/navigation/native";

export type NavigationFiles = { dataDir: string; library: string };

type NativeOpener = (
  dataPath: string,
  libraryPath: string,
  mapName: string,
) => NativeMap;

const MAP_NAMES: ReadonlyMap<number, string> = new Map([
  [0, "Azeroth"],
  [1, "Kalimdor"],
  [530, "Expansion01"],
  [571, "Northrend"],
]);

export function navigationMapName(mapId: number): string | undefined {
  return MAP_NAMES.get(mapId);
}

export function navigationSource(
  { dataDir, library }: NavigationFiles,
  openMap: NativeOpener = openNativeMap,
): NavigationSource {
  return {
    covers(mapId) {
      const name = navigationMapName(mapId);
      return name !== undefined && existsSync(join(dataDir, `${name}.map`));
    },
    open(mapId) {
      const name = navigationMapName(mapId);
      if (name === undefined)
        throw new Error(`unsupported map ${mapId} (no navigation map name)`);
      try {
        return openMap(dataDir, library, name);
      } catch (error) {
        if (!(error instanceof NavigationDataMissing)) throw error;
        throw new Error(
          `unsupported map ${mapId} (no ${name} navigation data)`,
          { cause: error },
        );
      }
    },
  };
}
