import {
  type GlyphSet,
  type GlyphSetName,
  glyphSets,
} from "#harness/ui/glyphs";

let current: GlyphSetName = "nerd";

export function setGlyphs(name: GlyphSetName): void {
  current = name;
}

export function glyphs(): GlyphSet {
  return glyphSets[current];
}

export function glyphSetName(): GlyphSetName {
  return current;
}
