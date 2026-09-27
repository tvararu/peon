import { describe, expect, test } from "bun:test";
import { GAME_TOOLS } from "#harness/tools/registry";
import { socialTool } from "#harness/tools/social";

const MAX_SENTENCE_WORDS = 25;
const MAX_DESCRIPTION_WORDS = 60;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/);
}

describe("GAME_TOOLS", () => {
  test("lists each tool once", () => {
    const names = GAME_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test.each([...GAME_TOOLS])("$name is labelled by its name", (tool) => {
    expect(tool.text.label.toLowerCase()).toBe(tool.name);
  });

  test.each([...GAME_TOOLS])("$name has one or two guidelines", (tool) => {
    expect(tool.text.guidelines.length).toBeGreaterThanOrEqual(1);
    expect(tool.text.guidelines.length).toBeLessThanOrEqual(2);
  });

  test.each([...GAME_TOOLS])(
    "$name text is short STE in printable ASCII",
    (tool) => {
      expect(tool.text.description.split(" ").length).toBeLessThanOrEqual(
        MAX_DESCRIPTION_WORDS,
      );
      for (const text of [tool.text.description, ...tool.text.guidelines]) {
        expect(text).toMatch(/^[\x20-\x7e]+$/);
        expect(text).not.toContain(";");
        for (const sentence of sentences(text))
          expect(sentence.split(" ").length).toBeLessThanOrEqual(
            MAX_SENTENCE_WORDS,
          );
      }
    },
  );

  test.each([...GAME_TOOLS])(
    "$name text names no hand method and no raw command",
    (tool) => {
      for (const text of [tool.text.description, ...tool.text.guidelines])
        expect(text).not.toMatch(
          /\b(relog|heading|gps|goto|walkToward|corpse legs?)\b/i,
        );
    },
  );

  test("never teaches a secret", () => {
    expect(socialTool.text.guidelines).toContain(
      "Never put an account name or a password in text.",
    );
  });
});
