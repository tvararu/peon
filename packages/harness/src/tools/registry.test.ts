import { describe, expect, test } from "bun:test";
import { GAME_TOOLS } from "#harness/tools/registry";

describe("GAME_TOOLS", () => {
  test("lists each tool once", () => {
    const names = GAME_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
