import { describe, expect, test } from "bun:test";
import { objectsHarness } from "#harness/areas/objects/area";

describe("objects harness area", () => {
  test("the area claims the use act", () => {
    expect(objectsHarness.worldActs).toEqual(["use"]);
  });
});
