import { describe, expect, test } from "bun:test";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scratchDir } from "@peon/core/test-support/scratch";
import { navigationMapName, navigationSource } from "#harness/navigation/maps";
import type { NativeMap } from "#harness/navigation/native";
import { createNavigation } from "#harness/navigation/planner";

const start = { x: 0, y: 0, z: 0 };
const end = { x: 10, y: 0, z: 0 };

async function withData<T>(names: string[], run: (dir: string) => T) {
  const dir = scratchDir("nav-maps");
  try {
    for (const name of names) await writeFile(join(dir, `${name}.map`), "");
    return run(dir);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

function flat(close: () => void): NativeMap {
  return {
    close,
    findHeight: () => 0,
    findHeights: () => [0],
    findLiquid: () => undefined,
    findPath: (from, to) => [from, to],
    lineOfSight: () => true,
    loadAdtAt() {},
  };
}

function opener() {
  const opened: string[] = [];
  const closed: string[] = [];
  const files = { dataDir: "fixture", library: "fixture" };
  const source = navigationSource(files, (_data, _library, name) => {
    opened.push(name);
    return flat(() => closed.push(name));
  });
  return { closed, opened, source };
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
    const { closed, opened, source } = opener();
    const nav = createNavigation(source.open);
    nav.plan(0, start, end);
    nav.plan(530, start, end);
    nav.plan(0, start, end);
    expect(opened).toEqual(["Azeroth", "Expansion01"]);
    nav.close();
    expect(closed.sort()).toEqual(["Azeroth", "Expansion01"]);
  });

  test("refuses a named map without its map file as unsupported, without the path", () =>
    withData(["Azeroth"], (dir) => {
      const library = join(dir, "Azeroth.map");
      const nav = createNavigation(
        navigationSource({ dataDir: dir, library }).open,
      );
      expect(() => nav.plan(1, start, end)).toThrow(
        new Error("unsupported map 1 (no Kalimdor navigation data)"),
      );
    }));

  test("refuses a map without a name before native construction", () => {
    const { opened, source } = opener();
    const nav = createNavigation(source.open);
    expect(() => nav.plan(36, start, end)).toThrow(/^unsupported map 36/);
    expect(opened).toEqual([]);
  });

  test("a missing native library is explicit rather than a flat-ground fallback", () => {
    const files = {
      dataDir: "/does-not-exist-nav-data",
      library: "/does-not-exist-libnamigator.so",
    };
    const nav = createNavigation(navigationSource(files).open);
    expect(() => nav.plan(530, start, end)).toThrow(/library not found/);
  });

  test("covers only a named map with a map file", () =>
    withData(["Azeroth"], (dir) => {
      const { covers } = navigationSource({ dataDir: dir, library: "l" });
      expect(covers(0)).toBe(true);
      expect(covers(530)).toBe(false);
      expect(covers(36)).toBe(false);
      const slashed = navigationSource({ dataDir: `${dir}/`, library: "l" });
      expect(slashed.covers(0)).toBe(true);
    }));
});
