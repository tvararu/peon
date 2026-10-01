import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { petsTameFailureBody } from "#test-support/areas/pets";
import type { PetsEvent } from "#wow/areas/pets/store";
import { GameOpcode } from "#wow/protocol/opcodes";

function rig() {
  const r = areaRig("pets", { now: () => 1000, selfGuid: 0x2an });
  const seen: PetsEvent[] = [];
  r.handle.onEvent((event) => seen.push(event));
  return { r, seen };
}

describe("pets tame failure", () => {
  test("reason 7 sets the last refusal and emits tame_failed", () => {
    const { r, seen } = rig();
    try {
      r.inject(GameOpcode.SMSG_PET_TAME_FAILURE, petsTameFailureBody(7));
      expect(r.handle.state().lastRefusal).toEqual({
        at: 1000,
        reason: "no_pet",
      });
      expect(seen).toEqual([
        { code: 7, reason: "no_pet", type: "tame_failed" },
      ]);
    } finally {
      r.dispose();
    }
  });

  test("an unnamed code is kept as unknown with its number", () => {
    const { r, seen } = rig();
    try {
      r.inject(GameOpcode.SMSG_PET_TAME_FAILURE, petsTameFailureBody(99));
      expect(seen).toEqual([
        { code: 99, reason: "unknown", type: "tame_failed" },
      ]);
    } finally {
      r.dispose();
    }
  });

  test("a later failure replaces the last refusal", () => {
    const { r, seen } = rig();
    try {
      r.inject(GameOpcode.SMSG_PET_TAME_FAILURE, petsTameFailureBody(7));
      r.inject(GameOpcode.SMSG_PET_TAME_FAILURE, petsTameFailureBody(12));
      expect(r.handle.state().lastRefusal?.reason).toBe("exotic");
      expect(seen.map((event) => event.type)).toEqual([
        "tame_failed",
        "tame_failed",
      ]);
    } finally {
      r.dispose();
    }
  });
});
