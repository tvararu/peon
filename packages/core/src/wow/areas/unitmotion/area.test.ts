import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  unitmotionSplineSpeedBody,
  unitmotionSplineToggleBody,
} from "#test-support/areas/unitmotion";
import { BASE_SPEEDS, type UnitmotionEvent } from "#wow/areas/unitmotion/store";
import { MovementFlag } from "#wow/protocol/entity-fields";
import type { SpeedKind } from "#wow/protocol/movement-block";
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

const SNARE_SPEEDS = [
  [GameOpcode.SMSG_SPLINE_SET_WALK_SPEED, "walk"],
  [GameOpcode.SMSG_SPLINE_SET_RUN_SPEED, "run"],
  [GameOpcode.SMSG_SPLINE_SET_RUN_BACK_SPEED, "run_back"],
  [GameOpcode.SMSG_SPLINE_SET_SWIM_SPEED, "swim"],
  [GameOpcode.SMSG_SPLINE_SET_SWIM_BACK_SPEED, "swim_back"],
  [GameOpcode.SMSG_SPLINE_SET_FLIGHT_SPEED, "flight"],
  [GameOpcode.SMSG_SPLINE_SET_FLIGHT_BACK_SPEED, "flight_back"],
] as const satisfies readonly (readonly [number, SpeedKind])[];

describe("unitmotion snare speeds", () => {
  function snare(scale: number) {
    return SNARE_SPEEDS.map(([opcode, kind]) => ({
      opcode,
      kind,
      body: unitmotionSplineSpeedBody({
        guid: CREATURE,
        speed: BASE_SPEEDS[kind] * scale,
      }),
    }));
  }

  test("a snare's seven speeds slow the creature and its release restores them", () => {
    const rig = areaRig("unitmotion");
    try {
      const seen: UnitmotionEvent[] = [];
      rig.handle.onEvent((event) => seen.push(event));
      rig.stores.areas.unitmotion.seed(CREATURE, {
        flags: 0,
        speeds: BASE_SPEEDS,
      });
      for (const { opcode, body } of snare(0.5)) rig.inject(opcode, body);
      const [slowed] = rig.handle.state().units;
      for (const [, kind] of SNARE_SPEEDS)
        expect(slowed?.speeds[kind]).toMatchObject({
          value: Math.fround(BASE_SPEEDS[kind] * 0.5),
          source: "spline",
        });
      expect(slowed?.runBefore).toBe(BASE_SPEEDS.run);
      expect(slowed?.serverControlled).toBe(true);
      expect(rig.stores.areas.unitmotion.ratio(CREATURE, "run")).toBe(0.5);
      expect(seen).toEqual(
        SNARE_SPEEDS.map(([, kind]) => ({
          type: "speed",
          guid: CREATURE,
          kind,
          value: Math.fround(BASE_SPEEDS[kind] * 0.5),
          previous: BASE_SPEEDS[kind],
          self: false,
        })),
      );
      seen.length = 0;
      for (const { opcode, body } of snare(1)) rig.inject(opcode, body);
      expect(rig.stores.areas.unitmotion.ratio(CREATURE, "run")).toBe(1);
      expect(rig.handle.state().units[0]?.runBefore).toBeUndefined();
      expect(
        seen.map((event) => event.type === "speed" && event.previous),
      ).toEqual(
        SNARE_SPEEDS.map(([, kind]) => Math.fround(BASE_SPEEDS[kind] * 0.5)),
      );
    } finally {
      rig.dispose();
    }
  });

  test("a speed packet for a guid with no entity is dropped and counted", () => {
    const rig = areaRig("unitmotion");
    try {
      for (const { opcode, body } of snare(0.5)) rig.inject(opcode, body);
      expect(rig.handle.state()).toEqual({ units: [], dropped: 7 });
    } finally {
      rig.dispose();
    }
  });
});
