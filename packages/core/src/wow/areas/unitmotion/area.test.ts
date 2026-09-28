import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { unitmotionSplineToggleBody } from "#test-support/areas/unitmotion";
import { BASE_SPEEDS, type UnitmotionEvent } from "#wow/areas/unitmotion/store";
import { MovementFlag } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";

const CREATURE = 0xf1_30_00_3e_ea_00_0a_bcn;
const STRANGER = 0xf1_30_00_3e_ea_00_0a_bdn;
const HOVERING =
  MovementFlag.HOVER | MovementFlag.DISABLE_GRAVITY | MovementFlag.FORWARD;

describe("unitmotion death toggles", () => {
  test("a dying creature loses hover and disabled gravity", () => {
    const rig = areaRig("unitmotion");
    try {
      const seen: UnitmotionEvent[] = [];
      rig.handle.onEvent((event) => seen.push(event));
      rig.stores.areas.unitmotion.seed(CREATURE, {
        flags: HOVERING,
        speeds: BASE_SPEEDS,
      });
      const body = unitmotionSplineToggleBody({ guid: CREATURE });
      rig.inject(GameOpcode.SMSG_SPLINE_MOVE_UNSET_HOVER, body);
      rig.inject(GameOpcode.SMSG_SPLINE_MOVE_GRAVITY_ENABLE, body);
      const [row] = rig.handle.state().units;
      expect(row?.flags).toBe(MovementFlag.FORWARD);
      expect(row?.serverControlled).toBe(true);
      expect(seen).toEqual([
        {
          type: "flag",
          guid: CREATURE,
          flag: "hover",
          on: false,
          flags: MovementFlag.DISABLE_GRAVITY | MovementFlag.FORWARD,
          self: false,
        },
        {
          type: "flag",
          guid: CREATURE,
          flag: "disable_gravity",
          on: false,
          flags: MovementFlag.FORWARD,
          self: false,
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a toggle for a unit no entity backs is dropped and counted", () => {
    const rig = areaRig("unitmotion");
    try {
      const seen: UnitmotionEvent[] = [];
      rig.handle.onEvent((event) => seen.push(event));
      const body = unitmotionSplineToggleBody({ guid: STRANGER });
      rig.inject(GameOpcode.SMSG_SPLINE_MOVE_UNSET_HOVER, body);
      rig.inject(GameOpcode.SMSG_SPLINE_MOVE_GRAVITY_ENABLE, body);
      expect(rig.handle.state()).toEqual({ units: [], dropped: 2 });
      expect(seen).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});
