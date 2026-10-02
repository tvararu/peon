import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  inspectInspectTalentBody,
  inspectRespondInspectAchievementsBody,
} from "#test-support/areas/inspect";
import { packTime } from "#test-support/areas/time";
import { GameOpcode } from "#wow/protocol/opcodes";

const NOON = { year: 2026, month: 9, day: 28, weekday: 1, hour: 12, minute: 0 };

describe("inspect area wiring", () => {
  test("SMSG_INSPECT_TALENT keeps no state and SMSG_RESPOND_INSPECT_ACHIEVEMENTS emits the count", () => {
    const rig = areaRig("inspect");
    try {
      rig.inject(
        GameOpcode.SMSG_INSPECT_TALENT,
        inspectInspectTalentBody({ gear: [], guid: 0x49_13n, short: true }),
      );
      expect(rig.handle.state()).toEqual({});
      rig.inject(
        GameOpcode.SMSG_RESPOND_INSPECT_ACHIEVEMENTS,
        inspectRespondInspectAchievementsBody({
          criteria: [],
          done: [{ id: 6, packedTime: packTime(NOON) }],
          guid: 0x49_13n,
        }),
      );
      expect(rig.handle.state()).toEqual({});
    } finally {
      rig.dispose();
    }
  });
});
