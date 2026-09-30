import { describe, expect, test } from "bun:test";
import {
  NEVER_HANDLED,
  STUB_EXAMPLE,
  STUB_EXAMPLE_LABEL,
} from "#test-support/never-handled";
import { AREA_NAMES, looseModule } from "#wow/areas/compose";
import { AREAS } from "#wow/areas/registry";
import { GameOpcode } from "#wow/protocol/opcodes";

const DEAD: Record<string, true> = {};
for (const name of AREA_NAMES)
  for (const opcode of looseModule(AREAS[name]).opcodes.dead)
    DEAD[opcode] = true;

describe("never-handled opcodes", () => {
  test("every example is real and sits in an area's dead list", () => {
    for (const name of NEVER_HANDLED) {
      expect(name in GameOpcode).toBe(true);
      expect(DEAD[name]).toBe(true);
    }
  });

  test("the stub example is a server opcode from that list", () => {
    expect(NEVER_HANDLED).toContain(STUB_EXAMPLE);
    expect(STUB_EXAMPLE).toStartWith("SMSG_");
    expect(STUB_EXAMPLE_LABEL.length).toBeGreaterThan(0);
  });
});
