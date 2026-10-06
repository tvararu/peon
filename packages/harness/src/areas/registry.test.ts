import { describe, expect, test } from "bun:test";
import { AREA_NAMES } from "@peon/core";
import { HARNESS_AREAS } from "#harness/areas/registry";
import { DOMAIN_GLYPH } from "#harness/ui/draw";
import { createMockGame } from "#test-support/mock-game";

type LooseRegistry = Readonly<
  Record<
    string,
    { readonly area: string; readonly worldActs: readonly string[] }
  >
>;

function actOf(game: object, area: string, act: string): unknown {
  const view: unknown = Reflect.get(game, area);
  if (typeof view !== "object" || view === null || !("act" in view)) return;
  const acts = view.act;
  return typeof acts === "object" && acts !== null
    ? Reflect.get(acts, act)
    : undefined;
}

function registryProblems(
  registry: LooseRegistry,
  names: readonly string[],
  game: object,
): string[] {
  return Object.entries(registry).flatMap(([key, module]) => [
    ...(names.includes(key) ? [] : [`${key}: not an area name`]),
    ...(Object.hasOwn(DOMAIN_GLYPH, key) ? [`${key}: a core log domain`] : []),
    ...(module.area === key ? [] : [`${key}: area is ${module.area}`]),
    ...module.worldActs
      .filter((act) => typeof actOf(game, key, act) !== "function")
      .map((act) => `${key}: ${act} is not an act`),
  ]);
}

describe("harness area registry", () => {
  test("every module names a core area, no core domain, and real acts", () => {
    expect(
      registryProblems(HARNESS_AREAS, AREA_NAMES, createMockGame()),
    ).toEqual([]);
  });

  test("a harness area keyed as a core log domain is reported", () => {
    expect(
      registryProblems(
        { loot: { area: "loot", worldActs: [] } },
        [],
        createMockGame(),
      ),
    ).toEqual(["loot: not an area name", "loot: a core log domain"]);
  });
});
