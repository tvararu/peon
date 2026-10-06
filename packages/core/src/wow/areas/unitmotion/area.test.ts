import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  unitmotionSplineSpeedBody,
  unitmotionSplineToggleBody,
} from "#test-support/areas/unitmotion";
import {
  MOTION_FLAG_BITS,
  type MotionFlagName,
} from "#wow/areas/unitmotion/protocol";
import { BASE_SPEEDS, type UnitmotionEvent } from "#wow/areas/unitmotion/store";
import { MovementFlag } from "#wow/protocol/entity-fields";
import type { SpeedKind } from "#wow/protocol/movement-block";
import { GameOpcode } from "#wow/protocol/opcodes";

const CREATURE = 0xf1_30_00_3e_ea_00_0a_bcn;
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

const TOGGLES = [
  [GameOpcode.SMSG_SPLINE_MOVE_ROOT, "root", true, 0],
  [GameOpcode.SMSG_SPLINE_MOVE_UNROOT, "root", false, MovementFlag.ROOT],
  [GameOpcode.SMSG_SPLINE_MOVE_SET_WALK_MODE, "walking", true, 0],
  [
    GameOpcode.SMSG_SPLINE_MOVE_SET_RUN_MODE,
    "walking",
    false,
    MovementFlag.WALKING,
  ],
  [GameOpcode.SMSG_SPLINE_MOVE_START_SWIM, "swimming", true, 0],
  [
    GameOpcode.SMSG_SPLINE_MOVE_STOP_SWIM,
    "swimming",
    false,
    MovementFlag.SWIMMING,
  ],
] as const satisfies readonly (readonly [
  number,
  MotionFlagName,
  boolean,
  number,
])[];

describe("unitmotion root, walk mode and swim toggles", () => {
  test.each(TOGGLES)("opcode %d sets %s to %p", (opcode, flag, on, before) => {
    const rig = areaRig("unitmotion");
    try {
      const seen: UnitmotionEvent[] = [];
      rig.handle.onEvent((event) => seen.push(event));
      rig.stores.areas.unitmotion.seed(CREATURE, {
        flags: before,
        speeds: BASE_SPEEDS,
      });
      rig.inject(opcode, unitmotionSplineToggleBody({ guid: CREATURE }));
      const bit = MOTION_FLAG_BITS[flag];
      const [row] = rig.handle.state().units;
      expect(((row?.flags ?? 0) & bit) !== 0).toBe(on);
      expect(seen).toEqual([
        {
          type: "flag",
          guid: CREATURE,
          flag,
          on,
          flags: row?.flags ?? -1,
          self: false,
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a toggle with trailing bytes is rejected", () => {
    const rig = areaRig("unitmotion");
    try {
      rig.stores.areas.unitmotion.seed(CREATURE, {
        flags: 0,
        speeds: BASE_SPEEDS,
      });
      const body = unitmotionSplineToggleBody({ guid: CREATURE });
      expect(() =>
        rig.inject(GameOpcode.SMSG_SPLINE_MOVE_ROOT, Uint8Array.of(...body, 0)),
      ).toThrow("Unexpected trailing spline unit payload");
      expect(rig.handle.state().units[0]?.flags).toBe(0);
    } finally {
      rig.dispose();
    }
  });
});

const RATES = [
  [GameOpcode.SMSG_SPLINE_SET_TURN_RATE, "turn"],
  [GameOpcode.SMSG_SPLINE_SET_PITCH_RATE, "pitch"],
] as const satisfies readonly (readonly [number, SpeedKind])[];

describe("unitmotion turn and pitch rates", () => {
  test("each rate packet sets its own speed and emits a speed event", () => {
    const rig = areaRig("unitmotion");
    try {
      const seen: UnitmotionEvent[] = [];
      rig.handle.onEvent((event) => seen.push(event));
      rig.stores.areas.unitmotion.seed(CREATURE, {
        flags: 0,
        speeds: BASE_SPEEDS,
      });
      for (const [opcode] of RATES)
        rig.inject(
          opcode,
          unitmotionSplineSpeedBody({ guid: CREATURE, speed: 1.5 }),
        );
      const [row] = rig.handle.state().units;
      for (const [, kind] of RATES)
        expect(row?.speeds[kind]).toMatchObject({
          value: 1.5,
          source: "spline",
        });
      expect(row?.speeds.run?.value).toBe(BASE_SPEEDS.run);
      expect(seen).toEqual(
        RATES.map(([, kind]) => ({
          type: "speed",
          guid: CREATURE,
          kind,
          value: 1.5,
          previous: BASE_SPEEDS[kind],
          self: false,
        })),
      );
    } finally {
      rig.dispose();
    }
  });
});

const FALL_FLY_TOGGLES = [
  [
    GameOpcode.SMSG_SPLINE_MOVE_FEATHER_FALL,
    "feather_fall",
    true,
    MovementFlag.FORWARD,
  ],
  [
    GameOpcode.SMSG_SPLINE_MOVE_NORMAL_FALL,
    "feather_fall",
    false,
    MovementFlag.FALLING_SLOW | MovementFlag.FORWARD,
  ],
  [
    GameOpcode.SMSG_SPLINE_MOVE_WATER_WALK,
    "water_walking",
    true,
    MovementFlag.FORWARD,
  ],
  [
    GameOpcode.SMSG_SPLINE_MOVE_LAND_WALK,
    "water_walking",
    false,
    MovementFlag.WATERWALKING | MovementFlag.FORWARD,
  ],
  [GameOpcode.SMSG_SPLINE_MOVE_SET_HOVER, "hover", true, MovementFlag.FORWARD],
  [
    GameOpcode.SMSG_SPLINE_MOVE_SET_FLYING,
    "can_fly",
    true,
    MovementFlag.FORWARD,
  ],
  [
    GameOpcode.SMSG_SPLINE_MOVE_UNSET_FLYING,
    "can_fly",
    false,
    MovementFlag.CAN_FLY | MovementFlag.FORWARD,
  ],
  [
    GameOpcode.SMSG_SPLINE_MOVE_GRAVITY_DISABLE,
    "disable_gravity",
    true,
    MovementFlag.FORWARD,
  ],
] as const satisfies readonly (readonly [
  number,
  MotionFlagName,
  boolean,
  number,
])[];

describe("unitmotion fall, water walk, hover and flight toggles", () => {
  test.each(FALL_FLY_TOGGLES)(
    "opcode %d sets %s to %p and keeps the other bits",
    (opcode, flag, on, before) => {
      const rig = areaRig("unitmotion");
      try {
        const seen: UnitmotionEvent[] = [];
        rig.handle.onEvent((event) => seen.push(event));
        rig.stores.areas.unitmotion.seed(CREATURE, {
          flags: before,
          speeds: BASE_SPEEDS,
        });
        rig.inject(opcode, unitmotionSplineToggleBody({ guid: CREATURE }));
        const bit = MOTION_FLAG_BITS[flag];
        const [row] = rig.handle.state().units;
        expect(row?.flags).toBe(on ? before | bit : before & ~bit);
        expect(seen).toEqual([
          {
            type: "flag",
            guid: CREATURE,
            flag,
            on,
            flags: row?.flags ?? -1,
            self: false,
          },
        ]);
      } finally {
        rig.dispose();
      }
    },
  );
});
