import { describe, expect, test } from "bun:test";
import { AREA_NAMES } from "@peon/core";
import { HARNESS_AREAS } from "#harness/areas/registry";
import { DOMAIN_GLYPH } from "#harness/ui/draw";

type LooseRegistry = Readonly<Record<string, { readonly area: string }>>;

function registryProblems(
  registry: LooseRegistry,
  names: readonly string[],
): string[] {
  return Object.entries(registry).flatMap(([key, module]) => [
    ...(names.includes(key) ? [] : [`${key}: not an area name`]),
    ...(Object.hasOwn(DOMAIN_GLYPH, key) ? [`${key}: a core log domain`] : []),
    ...(module.area === key ? [] : [`${key}: area is ${module.area}`]),
  ]);
}

describe("harness area registry", () => {
  test("every module names a core area and no core domain", () => {
    expect(registryProblems(HARNESS_AREAS, AREA_NAMES)).toEqual([]);
  });

  test("a harness area keyed as a core log domain is reported", () => {
    expect(registryProblems({ loot: { area: "loot" } }, [])).toEqual([
      "loot: not an area name",
      "loot: a core log domain",
    ]);
  });
});
