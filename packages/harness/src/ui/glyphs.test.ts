import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  glyphName,
  glyphNamesByChar,
  glyphSetNames,
  glyphSets,
  nerd,
  nerdClasses,
  resolveGlyphSet,
  tagNerdGlyphs,
  unicode,
} from "#harness/ui/glyphs";

const names = Object.keys(nerdClasses);

describe("glyph sets", () => {
  test("every set has the same 83 names", () => {
    expect(names).toHaveLength(83);
    for (const set of glyphSetNames) {
      expect(Object.keys(glyphSets[set]).sort()).toEqual([...names].sort());
    }
  });

  test("every glyph is one cell wide", () => {
    for (const set of glyphSetNames) {
      for (const glyph of Object.values(glyphSets[set])) {
        expect(visibleWidth(glyph)).toBe(1);
        expect(Bun.stringWidth(glyph)).toBe(1);
      }
    }
  });

  test("nerd and unicode map each glyph to one name", () => {
    for (const set of [nerd, unicode]) {
      for (const owners of glyphNamesByChar(set).values()) {
        expect(owners).toHaveLength(1);
      }
    }
  });
});

describe("resolveGlyphSet", () => {
  const quiet = () => undefined;

  test("the flag wins over the environment", () => {
    expect(resolveGlyphSet("ascii", "unicode", quiet)).toBe("ascii");
  });

  test("the environment applies when there is no flag", () => {
    expect(resolveGlyphSet(undefined, "unicode", quiet)).toBe("unicode");
  });

  test("nerd is the default", () => {
    expect(resolveGlyphSet(undefined, undefined, quiet)).toBe("nerd");
    expect(resolveGlyphSet(undefined, "", quiet)).toBe("nerd");
  });

  test("an unknown value warns once and gives nerd", () => {
    const warnings: string[] = [];
    expect(resolveGlyphSet("emoji", undefined, (m) => warnings.push(m))).toBe(
      "nerd",
    );
    expect(warnings).toEqual([
      "--glyphs=emoji is not one of nerd|unicode|ascii; using nerd",
    ]);
  });
});

describe("tagNerdGlyphs", () => {
  test("replaces each nerd glyph with its name", () => {
    const screen = `${nerd.hostile} Springpaw 8y${nerd.compassNE}`;
    expect(tagNerdGlyphs(screen)).toBe("<hostile> Springpaw 8y<compassNE>");
    expect(glyphName(nerd.corpse)).toBe("corpse");
    expect(glyphName("a")).toBeUndefined();
  });
});
