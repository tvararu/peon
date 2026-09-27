import { describe, expect, test } from "bun:test";
import { blockersOf, heldUntilRemoved } from "#harness/grader/preflight";
import { loadScenario } from "#harness/grader/scenarios";

describe("blockersOf", () => {
  test("a scenario without blockedBy has no blockers", async () => {
    expect(
      await blockersOf(loadScenario("t0-self-state"), heldUntilRemoved),
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

  test("the map 0 scenarios run now that Azeroth has navigation", async () => {
    for (const id of ["t4-alliance-first", "t5-vendor-buy-goldshire"])
      expect(await blockersOf(loadScenario(id), heldUntilRemoved)).toEqual([]);
  });
});
