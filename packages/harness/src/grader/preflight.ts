import { homedir } from "node:os";
import { parseConfig } from "@tuicraft/core/lib/config";
import type { Scenario } from "#harness/grader/scenarios";

export type Preflight = (key: string) => Promise<boolean>;

const TRAILING_SLASH = /\/+$/;

const MAP_FILES: Readonly<Record<string, string>> = {
  "map-0-navigation": "Azeroth.map",
};

export async function blockersOf(
  scenario: Scenario,
  stillBlocked: Preflight,
): Promise<string[]> {
  const blocked: string[] = [];
  for (const key of scenario.blockedBy ?? [])
    if (await stillBlocked(key)) blocked.push(key);
  return blocked;
}

async function navDataDir(configPath: string): Promise<string | undefined> {
  const file = Bun.file(configPath);
  if (!(await file.exists())) return undefined;
  return parseConfig(await file.text()).navigation_data_dir;
}

export function navPreflight(
  configPath = `${homedir()}/.config/tuicraft/config.toml`,
): Preflight {
  return async (key) => {
    const map = MAP_FILES[key];
    if (map === undefined) return true;
    const dir = await navDataDir(configPath);
    if (dir === undefined) return true;
    return !(await Bun.file(
      `${dir.replace(TRAILING_SLASH, "")}/${map}`,
    ).exists());
  };
}
