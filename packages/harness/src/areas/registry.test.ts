import { describe, expect, test } from "bun:test";
import { AREA_NAMES } from "@peon/core";
import { HARNESS_AREAS, HARNESS_AREAS_TOTAL } from "#harness/areas/registry";
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

const FIXTURE: LooseRegistry = {
  alpha: { area: "alpha", worldActs: ["ping"] },
  beta: { area: "gamma", worldActs: ["pong"] },
  loot: { area: "loot", worldActs: [] },
};

describe("harness area registry", () => {
  test("every module names a core area, no core domain, and real acts", () => {
    expect(
      registryProblems(HARNESS_AREAS, AREA_NAMES, createMockGame()),
    ).toEqual([]);
  });

  test("the checks name each broken fixture module", () => {
    const game = Object.assign(createMockGame(), {
      alpha: { act: { ping: () => undefined } },
      beta: { act: { pong: 1 } },
    });
    expect(registryProblems(FIXTURE, ["alpha", "beta"], game)).toEqual([
      "beta: area is gamma",
      "beta: pong is not an act",
      "loot: not an area name",
      "loot: a core log domain",
    ]);
  });

  test("the registry is total over the core area names", () => {
    type Fixture = { alpha: unknown };
    type Total<N extends string> = [Exclude<N, keyof Fixture>] extends [never]
      ? true
      : false;
    const complete: Total<"alpha"> = true;
    const missing: Total<"alpha" | "beta"> = false;
    expect([complete, missing, HARNESS_AREAS_TOTAL]).toEqual([
      true,
      false,
      true,
    ]);
  });
});
