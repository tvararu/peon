import { describe, expect, test } from "bun:test";
import type { ToolName } from "#harness/contract/result";
import { TOOL_TEXT } from "#harness/prompt/guidelines";

const TOOLS: ToolName[] = [
  "look",
  "travel",
  "engage",
  "loot",
  "interact",
  "rest",
  "recover",
  "social",
  "journal",
  "stop",
];
const LABELS = [
  "Look",
  "Travel",
  "Engage",
  "Loot",
  "Interact",
  "Rest",
  "Recover",
  "Social",
  "Journal",
  "Stop",
];
const MAX_SENTENCE_WORDS = 25;
const MAX_DESCRIPTION_WORDS = 60;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/);
}

function texts(tool: ToolName): string[] {
  return [TOOL_TEXT[tool].description, ...TOOL_TEXT[tool].guidelines];
}

describe("TOOL_TEXT", () => {
  test("has text for the ten tools and no other", () => {
    expect(Object.keys(TOOL_TEXT).sort()).toEqual([...TOOLS].sort());
  });

  test("uses the contract labels", () => {
    expect(TOOLS.map((tool) => TOOL_TEXT[tool].label)).toEqual(LABELS);
  });

  test.each(TOOLS)("%s has one or two guidelines", (tool) => {
    expect(TOOL_TEXT[tool].guidelines.length).toBeGreaterThanOrEqual(1);
    expect(TOOL_TEXT[tool].guidelines.length).toBeLessThanOrEqual(2);
  });

  test.each(TOOLS)("%s text is short STE in printable ASCII", (tool) => {
    expect(TOOL_TEXT[tool].description.split(" ").length).toBeLessThanOrEqual(
      MAX_DESCRIPTION_WORDS,
    );
    for (const text of texts(tool)) {
      expect(text).toMatch(/^[\x20-\x7e]+$/);
      expect(text).not.toContain(";");
      for (const sentence of sentences(text))
        expect(sentence.split(" ").length).toBeLessThanOrEqual(
          MAX_SENTENCE_WORDS,
        );
    }
  });

  test.each(TOOLS)(
    "%s text names no hand method and no raw command",
    (tool) => {
      for (const text of texts(tool))
        expect(text).not.toMatch(
          /\b(relog|heading|gps|goto|walkToward|corpse legs?)\b/i,
        );
    },
  );

  test("never teaches a secret", () => {
    expect(TOOL_TEXT.social.guidelines).toContain(
      "Never put an account name or a password in text.",
    );
  });
});
