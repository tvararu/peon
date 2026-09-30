import { MovementFlag, UpdateFlag } from "#wow/protocol/entity-fields";
import {
  type CreateSpline,
  parseCreateSpline,
} from "#wow/protocol/monster-move";
import { type MovementInfo, parseMovementInfo } from "#wow/protocol/movement";
import type { PacketReader } from "#wow/protocol/packet";

type Point = { x: number; y: number; z: number; orientation: number };

export const CREATE_SPEED_ORDER = [
  "walk",
  "run",
  "run_back",
  "swim",
  "swim_back",
  "flight",
  "flight_back",
  "turn",
  "pitch",
] as const;
export type SpeedKind = (typeof CREATE_SPEED_ORDER)[number];
export type Speeds = Readonly<Record<SpeedKind, number>>;

export type MovementData = {
  updateFlags: number;
  point?: Point;
  rotation?: Rotation;
  runSpeed?: number;
  runBackSpeed?: number;
  turnRate?: number;
  speeds?: Speeds;
  movementInfo?: MovementInfo;
  spline?: CreateSpline;
};

type Placement = Omit<MovementData, "updateFlags">;

function readSpeeds(r: PacketReader): Speeds {
  return {
    walk: r.floatLE(),
    run: r.floatLE(),
    run_back: r.floatLE(),
    swim: r.floatLE(),
    swim_back: r.floatLE(),
    flight: r.floatLE(),
    flight_back: r.floatLE(),
    turn: r.floatLE(),
    pitch: r.floatLE(),
  };
}

function readLiving(r: PacketReader): Placement {
  const movementInfo = parseMovementInfo(r);
  const { flags, x, y, z, orientation } = movementInfo;
  const speeds = readSpeeds(r);
  const splined = flags & MovementFlag.SPLINE_ENABLED;
  const spline = splined ? parseCreateSpline(r) : undefined;
  return {
    point: { x, y, z, orientation },
    runSpeed: speeds.run,
    runBackSpeed: speeds.run_back,
    turnRate: speeds.turn,
    speeds,
    movementInfo,
    spline,
  };
}

function readStationaryTransport(r: PacketReader): Placement {
  r.packedGuid();
  const position = r.vec3();
  r.skip(12);
  const orientation = r.floatLE();
  r.skip(4);
  return { point: { ...position, orientation } };
}

function readPlacement(r: PacketReader, updateFlags: number): Placement {
  if (updateFlags & UpdateFlag.LIVING) return readLiving(r);
  if (updateFlags & UpdateFlag.POSITION) return readStationaryTransport(r);
  if (updateFlags & UpdateFlag.HAS_POSITION)
    return { point: { ...r.vec3(), orientation: r.floatLE() } };
  return {};
}

export type Rotation = { x: number; y: number; z: number; w: number };

export function unpackRotation(packed: bigint): Rotation {
  const x = Number(BigInt.asIntN(22, packed >> 42n)) / (1 << 21);
  const y = Number(BigInt.asIntN(21, packed >> 21n)) / (1 << 20);
  const z = Number(BigInt.asIntN(21, packed)) / (1 << 20);
  const w = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z));
  return { w, x, y, z };
}

function readTrailer(
  r: PacketReader,
  updateFlags: number,
): Pick<MovementData, "rotation"> {
  if (updateFlags & UpdateFlag.HIGH_GUID) r.skip(4);
  if (updateFlags & UpdateFlag.LOW_GUID) r.skip(4);
  if (updateFlags & UpdateFlag.HAS_ATTACKING_TARGET) r.packedGuid();
  if (updateFlags & UpdateFlag.TRANSPORT) r.skip(4);
  if (updateFlags & UpdateFlag.VEHICLE) r.skip(8);
  if (!(updateFlags & UpdateFlag.ROTATION)) return {};
  return { rotation: unpackRotation(r.uint64LE()) };
}
export function parseMovementBlock(r: PacketReader): MovementData {
  const updateFlags = r.uint16LE();
  const placement = readPlacement(r, updateFlags);
  const trailer = readTrailer(r, updateFlags);
  return { updateFlags, ...placement, ...trailer };
}
