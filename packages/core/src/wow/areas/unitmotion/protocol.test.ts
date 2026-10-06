import { describe, expect, test } from "bun:test";
import {
  unitmotionSplineSpeedBody,
  unitmotionSplineToggleBody,
} from "#test-support/areas/unitmotion";
import { UNITMOTION_OPCODES } from "#wow/areas/unitmotion/opcodes";
import {
  parseSplineUnitState,
  SPLINE_UNIT_TABLE,
} from "#wow/areas/unitmotion/protocol";
import { MovementFlag } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

const UNIT = 0xf1_30_00_3e_ea_00_0a_bcn;

const SPEEDS = [
  [GameOpcode.SMSG_SPLINE_SET_WALK_SPEED, "walk"],
  [GameOpcode.SMSG_SPLINE_SET_RUN_SPEED, "run"],
  [GameOpcode.SMSG_SPLINE_SET_RUN_BACK_SPEED, "run_back"],
  [GameOpcode.SMSG_SPLINE_SET_SWIM_SPEED, "swim"],
  [GameOpcode.SMSG_SPLINE_SET_SWIM_BACK_SPEED, "swim_back"],
  [GameOpcode.SMSG_SPLINE_SET_TURN_RATE, "turn"],
  [GameOpcode.SMSG_SPLINE_SET_FLIGHT_SPEED, "flight"],
  [GameOpcode.SMSG_SPLINE_SET_FLIGHT_BACK_SPEED, "flight_back"],
  [GameOpcode.SMSG_SPLINE_SET_PITCH_RATE, "pitch"],
] as const;

const FLAGS = [
  [GameOpcode.SMSG_SPLINE_MOVE_ROOT, "root", MovementFlag.ROOT, true],
  [GameOpcode.SMSG_SPLINE_MOVE_UNROOT, "root", MovementFlag.ROOT, false],
  [
    GameOpcode.SMSG_SPLINE_MOVE_SET_WALK_MODE,
    "walking",
    MovementFlag.WALKING,
    true,
  ],
  [
    GameOpcode.SMSG_SPLINE_MOVE_SET_RUN_MODE,
    "walking",
    MovementFlag.WALKING,
    false,
  ],
  [
    GameOpcode.SMSG_SPLINE_MOVE_START_SWIM,
    "swimming",
    MovementFlag.SWIMMING,
    true,
  ],
  [
    GameOpcode.SMSG_SPLINE_MOVE_STOP_SWIM,
    "swimming",
    MovementFlag.SWIMMING,
    false,
  ],
  [
    GameOpcode.SMSG_SPLINE_MOVE_FEATHER_FALL,
    "feather_fall",
    MovementFlag.FALLING_SLOW,
    true,
  ],
  [
    GameOpcode.SMSG_SPLINE_MOVE_NORMAL_FALL,
    "feather_fall",
    MovementFlag.FALLING_SLOW,
    false,
  ],
  [
    GameOpcode.SMSG_SPLINE_MOVE_WATER_WALK,
    "water_walking",
    MovementFlag.WATERWALKING,
    true,
  ],
  [
    GameOpcode.SMSG_SPLINE_MOVE_LAND_WALK,
    "water_walking",
    MovementFlag.WATERWALKING,
    false,
  ],
  [GameOpcode.SMSG_SPLINE_MOVE_SET_HOVER, "hover", MovementFlag.HOVER, true],
  [GameOpcode.SMSG_SPLINE_MOVE_UNSET_HOVER, "hover", MovementFlag.HOVER, false],
  [
    GameOpcode.SMSG_SPLINE_MOVE_SET_FLYING,
    "can_fly",
    MovementFlag.CAN_FLY,
    true,
  ],
  [
    GameOpcode.SMSG_SPLINE_MOVE_UNSET_FLYING,
    "can_fly",
    MovementFlag.CAN_FLY,
    false,
  ],
  [
    GameOpcode.SMSG_SPLINE_MOVE_GRAVITY_DISABLE,
    "disable_gravity",
    MovementFlag.DISABLE_GRAVITY,
    true,
  ],
  [
    GameOpcode.SMSG_SPLINE_MOVE_GRAVITY_ENABLE,
    "disable_gravity",
    MovementFlag.DISABLE_GRAVITY,
    false,
  ],
] as const;

function speedBody(speed: number): PacketReader {
  return new PacketReader(unitmotionSplineSpeedBody({ guid: UNIT, speed }));
}

describe("unitmotion spline parser", () => {
  test("the table covers every owned opcode and nothing else", () => {
    const owned = UNITMOTION_OPCODES.owns.map((name) => GameOpcode[name]);
    expect([...SPLINE_UNIT_TABLE.keys()].sort()).toEqual(owned.sort());
  });

  test.each(SPEEDS)(
    "speed opcode %d reads a packed guid then a float (Unit.cpp:11037-11040)",
    (opcode, kind) => {
      const r = speedBody(3.5);
      expect(parseSplineUnitState(opcode, r)).toEqual({
        opcode,
        guid: UNIT,
        kind: "speed",
        speed: kind,
        value: 3.5,
      });
      expect(r.remaining).toBe(0);
    },
  );

  test.each(FLAGS)(
    "toggle opcode %d reads a packed guid only",
    (opcode, flag, bit, on) => {
      const r = new PacketReader(unitmotionSplineToggleBody({ guid: UNIT }));
      expect(parseSplineUnitState(opcode, r)).toEqual({
        opcode,
        guid: UNIT,
        kind: "flag",
        flag,
        bit,
        on,
      });
    },
  );

  test("SMSG_SPLINE_MOVE_ROOT reads a packed guid (Unit.cpp:14085-14086), not a full guid", () => {
    const body = Uint8Array.of(0b0000_0011, 0x2a, 0x01);
    expect(
      parseSplineUnitState(
        GameOpcode.SMSG_SPLINE_MOVE_ROOT,
        new PacketReader(body),
      ),
    ).toMatchObject({ guid: 0x01_2an, flag: "root", on: true });
  });

  test("a NaN, infinite or negative speed throws", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1])
      expect(() =>
        parseSplineUnitState(
          GameOpcode.SMSG_SPLINE_SET_RUN_SPEED,
          speedBody(bad),
        ),
      ).toThrow(RangeError);
  });

  test("a trailing byte throws", () => {
    const toggle = Uint8Array.of(
      ...unitmotionSplineToggleBody({ guid: UNIT }),
      0,
    );
    const speed = Uint8Array.of(
      ...unitmotionSplineSpeedBody({ guid: UNIT, speed: 7 }),
      0,
    );
    expect(() =>
      parseSplineUnitState(
        GameOpcode.SMSG_SPLINE_MOVE_UNSET_HOVER,
        new PacketReader(toggle),
      ),
    ).toThrow(RangeError);
    expect(() =>
      parseSplineUnitState(
        GameOpcode.SMSG_SPLINE_SET_RUN_SPEED,
        new PacketReader(speed),
      ),
    ).toThrow(RangeError);
  });

  test("an opcode outside the table throws", () => {
    expect(() =>
      parseSplineUnitState(
        GameOpcode.SMSG_MONSTER_MOVE,
        new PacketReader(unitmotionSplineToggleBody({ guid: UNIT })),
      ),
    ).toThrow(RangeError);
  });
});
