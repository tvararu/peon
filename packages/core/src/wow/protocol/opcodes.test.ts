import { describe, expect, test } from "bun:test";
import { GameOpcode } from "#wow/protocol/opcodes";
import previous from "../../../test-support/previous-game-opcodes.json" with {
  type: "json",
};

describe("GameOpcode", () => {
  test("keeps the number of every opcode declared before generation", () => {
    const moved = Object.entries(previous).filter(
      ([name, opcode]) =>
        (GameOpcode as Record<string, number>)[name] !== opcode,
    );
    expect(moved).toEqual([]);
  });

  test("gives each opcode one name", () => {
    const values = Object.values(GameOpcode);
    expect(new Set(values).size).toBe(values.length);
  });
});
