import { afterEach, describe, expect, test } from "bun:test";
import { glyphSetName, glyphs, setGlyphs } from "#harness/ui/context";
import { ascii, nerd } from "#harness/ui/glyphs";

describe("glyph context", () => {
  afterEach(() => setGlyphs("nerd"));

  test("starts with the nerd set", () => {
    expect(glyphSetName()).toBe("nerd");
    expect(glyphs()).toBe(nerd);
  });

  test("setGlyphs changes the set that glyphs returns", () => {
    setGlyphs("ascii");
    expect(glyphSetName()).toBe("ascii");
    expect(glyphs().hostile).toBe(ascii.hostile);
  });
});
