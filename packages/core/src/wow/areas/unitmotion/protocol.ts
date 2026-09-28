import type { OpcodeName } from "#wow/areas/contract";
import { MovementFlag } from "#wow/protocol/entity-fields";
import type { SpeedKind } from "#wow/protocol/movement-block";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { PacketReader } from "#wow/protocol/packet";

export type MotionFlagName =
  | "root"
  | "walking"
  | "swimming"
  | "water_walking"
  | "feather_fall"
  | "hover"
  | "can_fly"
  | "disable_gravity";

export type SplineUnitEntry =
  | { kind: "speed"; speed: SpeedKind }
  | { kind: "flag"; flag: MotionFlagName; bit: number; on: boolean };

export type SplineUnitState = { opcode: number; guid: bigint } & (
  | { kind: "speed"; speed: SpeedKind; value: number }
  | { kind: "flag"; flag: MotionFlagName; bit: number; on: boolean }
);

export const MOTION_FLAG_BITS: Readonly<Record<MotionFlagName, number>> = {
  root: MovementFlag.ROOT,
  walking: MovementFlag.WALKING,
  swimming: MovementFlag.SWIMMING,
  water_walking: MovementFlag.WATERWALKING,
  feather_fall: MovementFlag.FALLING_SLOW,
  hover: MovementFlag.HOVER,
  can_fly: MovementFlag.CAN_FLY,
  disable_gravity: MovementFlag.DISABLE_GRAVITY,
};

function speed(kind: SpeedKind): SplineUnitEntry {
  return { kind: "speed", speed: kind };
}

function flag(name: MotionFlagName, on: boolean): SplineUnitEntry {
  return { kind: "flag", flag: name, bit: MOTION_FLAG_BITS[name], on };
}

const SPLINE_UNIT_ROWS: readonly (readonly [OpcodeName, SplineUnitEntry])[] = [
  ["SMSG_SPLINE_SET_WALK_SPEED", speed("walk")],
  ["SMSG_SPLINE_SET_RUN_SPEED", speed("run")],
  ["SMSG_SPLINE_SET_RUN_BACK_SPEED", speed("run_back")],
  ["SMSG_SPLINE_SET_SWIM_SPEED", speed("swim")],
  ["SMSG_SPLINE_SET_SWIM_BACK_SPEED", speed("swim_back")],
  ["SMSG_SPLINE_SET_TURN_RATE", speed("turn")],
  ["SMSG_SPLINE_SET_FLIGHT_SPEED", speed("flight")],
  ["SMSG_SPLINE_SET_FLIGHT_BACK_SPEED", speed("flight_back")],
  ["SMSG_SPLINE_SET_PITCH_RATE", speed("pitch")],
  ["SMSG_SPLINE_MOVE_ROOT", flag("root", true)],
  ["SMSG_SPLINE_MOVE_UNROOT", flag("root", false)],
  ["SMSG_SPLINE_MOVE_SET_WALK_MODE", flag("walking", true)],
  ["SMSG_SPLINE_MOVE_SET_RUN_MODE", flag("walking", false)],
  ["SMSG_SPLINE_MOVE_START_SWIM", flag("swimming", true)],
  ["SMSG_SPLINE_MOVE_STOP_SWIM", flag("swimming", false)],
  ["SMSG_SPLINE_MOVE_FEATHER_FALL", flag("feather_fall", true)],
  ["SMSG_SPLINE_MOVE_NORMAL_FALL", flag("feather_fall", false)],
  ["SMSG_SPLINE_MOVE_WATER_WALK", flag("water_walking", true)],
  ["SMSG_SPLINE_MOVE_LAND_WALK", flag("water_walking", false)],
  ["SMSG_SPLINE_MOVE_SET_HOVER", flag("hover", true)],
  ["SMSG_SPLINE_MOVE_UNSET_HOVER", flag("hover", false)],
  ["SMSG_SPLINE_MOVE_SET_FLYING", flag("can_fly", true)],
  ["SMSG_SPLINE_MOVE_UNSET_FLYING", flag("can_fly", false)],
  ["SMSG_SPLINE_MOVE_GRAVITY_DISABLE", flag("disable_gravity", true)],
  ["SMSG_SPLINE_MOVE_GRAVITY_ENABLE", flag("disable_gravity", false)],
];

export const SPLINE_UNIT_TABLE: ReadonlyMap<number, SplineUnitEntry> = new Map(
  SPLINE_UNIT_ROWS.map(([name, entry]) => [GameOpcode[name], entry]),
);

function end(r: PacketReader): void {
  if (r.remaining !== 0)
    throw new RangeError("Unexpected trailing spline unit payload");
}

function speedValue(r: PacketReader): number {
  const value = r.floatLE();
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError("Invalid spline unit speed");
  return value;
}

export function parseSplineUnitState(
  opcode: number,
  r: PacketReader,
): SplineUnitState {
  const entry = SPLINE_UNIT_TABLE.get(opcode);
  if (entry === undefined)
    throw new RangeError("Unsupported spline unit opcode");
  const guid = r.packedGuidBig();
  if (entry.kind === "flag") {
    end(r);
    return { opcode, guid, ...entry };
  }
  const value = speedValue(r);
  end(r);
  return { opcode, guid, kind: "speed", speed: entry.speed, value };
}
