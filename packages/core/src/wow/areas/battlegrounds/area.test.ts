import { describe, expect, test } from "bun:test";
import { battlegroundsScene } from "#test-support/areas/battlegrounds";
import { BATTLEGROUNDS_OPCODES } from "#wow/areas/battlegrounds/opcodes";

describe("battlegrounds area wiring", () => {
  test("the area owns the four server opcodes and tracks the self flag state", () => {
    const { rig, update } = battlegroundsScene();
    try {
      expect([...BATTLEGROUNDS_OPCODES.owns]).toContain(
        "MSG_INSPECT_HONOR_STATS",
      );
      update(0x0b_00n, { byte2: 0x01, playerFlags: 0x200 });
      expect(rig.handle.state().self).toMatchObject({
        flagged: true,
        wantsFlag: true,
      });
    } finally {
      rig.dispose();
    }
  });
});
