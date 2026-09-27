import { describe, expect, test } from "bun:test";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { native } from "#test-support/navigation-fixtures";
import { scratchDir } from "#test-support/scratch";
import { createNavigation, type NavPoint } from "#wow/navigation";
import { hasNavigationData, navigationMapName } from "#wow/navigation-maps";
import type { NativeMap } from "#wow/navigation-native";

const start: NavPoint = { x: 0, y: 0, z: 0 };
const end: NavPoint = { x: 10, y: 0, z: 0 };

async function withData<T>(names: string[], run: (dir: string) => T) {
  const dir = scratchDir("nav-maps");
  try {
    for (const name of names) await writeFile(join(dir, `${name}.map`), "");
    return run(dir);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

function opener() {
  const opened: string[] = [];
  const closed: string[] = [];
  const open = (_data: string, _library: string, name: string): NativeMap => {
    opened.push(name);
    return native({ close: () => closed.push(name) });
  };
  return { closed, open, opened };
}

describe("navigation maps", () => {
  test("names the continents by map id", () => {
    expect(navigationMapName(0)).toBe("Azeroth");
    expect(navigationMapName(1)).toBe("Kalimdor");
    expect(navigationMapName(530)).toBe("Expansion01");
    expect(navigationMapName(571)).toBe("Northrend");
    expect(navigationMapName(36)).toBeUndefined();
  });

  test("opens each map once under its own name and closes them all", () => {
    const { closed, open, opened } = opener();
    const nav = createNavigation(
      { dataPath: "fixture", libraryPath: "fixture" },
      open,
    );
    nav.plan(0, start, end);
    nav.plan(530, start, end);
    nav.plan(0, start, end);
    expect(opened).toEqual(["Azeroth", "Expansion01"]);
    nav.close();
    expect(closed.sort()).toEqual(["Azeroth", "Expansion01"]);
  });

  test("refuses a named map without its map file as unsupported, without the path", () =>
    withData(["Azeroth"], (dir) => {
      const nav = createNavigation({
        dataPath: dir,
        libraryPath: join(dir, "Azeroth.map"),
      });
      expect(() => nav.plan(1, start, end)).toThrow(
        new Error("unsupported map 1 (no Kalimdor navigation data)"),
      );
    }));

  test("refuses a map without a name before native construction", () => {
    const { open, opened } = opener();
    const nav = createNavigation(
      { dataPath: "fixture", libraryPath: "fixture" },
      open,
    );
    expect(() => nav.plan(36, start, end)).toThrow(/^unsupported map 36/);
    expect(opened).toEqual([]);
  });

  test("reports navigation data only for a named map with a map file", () =>
    withData(["Azeroth"], (dir) => {
      expect(hasNavigationData(dir, 0)).toBe(true);
      expect(hasNavigationData(dir, 530)).toBe(false);
      expect(hasNavigationData(dir, 36)).toBe(false);
      expect(hasNavigationData(`${dir}/`, 0)).toBe(true);
    }));
});
