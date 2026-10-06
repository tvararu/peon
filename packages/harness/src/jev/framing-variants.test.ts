import { describe, expect, test } from "bun:test";
import { buildFraming } from "#harness/jev/framing";

describe("buildFraming", () => {
  test("returns undefined for none variant", () => {
    expect(buildFraming("none", { self: { level: 10 } })).toBeUndefined();
  });

  test("names no class when the class is unknown", () => {
    const text = buildFraming("minimal", { self: { level: 10 } });
    expect(text).toBe(
      "In World of Warcraft 3.3.5a, you are a level 10 character fighting a hostile creature.",
    );
  });

  test("supports custom character class parameter", () => {
    const text = buildFraming("minimal", { self: { level: 5 } }, "Mage");
    expect(text).toContain("level 5");
    expect(text).toContain("Mage");
  });

  test("handles missing level in observation safely", () => {
    const text = buildFraming("minimal", {}, "Priest");
    expect(text).toBe(
      "In World of Warcraft 3.3.5a, you are a Priest fighting a hostile creature.",
    );
  });
});
