import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { blockersOf, navPreflight } from "#harness/grader/preflight";
import { loadScenario } from "#harness/grader/scenarios";

async function navDir(maps: readonly string[]): Promise<string> {
  const root = await mkdtemp(`${tmpdir()}/preflight-`);
  await mkdir(`${root}/nav`);
  for (const map of maps) await writeFile(`${root}/nav/${map}.map`, "");
  const config = `${root}/config.toml`;
  await writeFile(
    config,
    `account = "A"\npassword = "p"\ncharacter = "C"\nnavigation_data_dir = "${root}/nav"\n`,
  );
  return config;
}

describe("blockersOf", () => {
  test("a scenario without blockedBy has no blockers", async () => {
    expect(
      await blockersOf(loadScenario("t0-self-state"), async () => true),
    ).toEqual([]);
  });

  test("keeps only the keys the check still reports as blocked", async () => {
    const scenario = {
      ...loadScenario("t0-self-state"),
      blockedBy: ["a", "b"],
    };
    expect(await blockersOf(scenario, async (key) => key === "b")).toEqual([
      "b",
    ]);
  });

  test("the map 0 scenarios name map-0-navigation", () => {
    for (const id of ["t4-alliance-first", "t5-vendor-buy-goldshire"])
      expect(loadScenario(id).blockedBy).toEqual(["map-0-navigation"]);
  });
});

describe("navPreflight", () => {
  test("map-0-navigation holds while the nav data has no Azeroth map", async () => {
    const check = navPreflight(await navDir(["Expansion01"]));
    expect(await check("map-0-navigation")).toBe(true);
  });

  test("map-0-navigation lifts once Azeroth.map is in the nav data", async () => {
    const check = navPreflight(await navDir(["Expansion01", "Azeroth"]));
    expect(await check("map-0-navigation")).toBe(false);
  });

  test("a missing config and an unknown key stay blocked", async () => {
    const root = await mkdtemp(`${tmpdir()}/preflight-`);
    expect(await navPreflight(`${root}/none.toml`)("map-0-navigation")).toBe(
      true,
    );
    expect(await navPreflight(await navDir(["Azeroth"]))("other")).toBe(true);
  });
});
