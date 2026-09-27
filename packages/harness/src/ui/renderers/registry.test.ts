import { describe, expect, test } from "bun:test";
import type { ToolName } from "#harness/contract/result";
import { rendererFor } from "#harness/ui/renderers/registry";

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

describe("rendererFor", () => {
  test("every tool has both renderers or neither, so Pi falls back cleanly", () => {
    for (const tool of TOOLS) {
      const renderers = rendererFor(tool);
      expect(renderers.renderCall === undefined).toBe(
        renderers.renderResult === undefined,
      );
    }
  });

  test("the line family is built", () => {
    for (const tool of ["social", "stop"] as const) {
      expect(rendererFor(tool).renderCall).toBeFunction();
      expect(rendererFor(tool).renderResult).toBeFunction();
    }
  });
});
