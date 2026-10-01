import type { ControlDeps } from "#wow/control";
import type { Emit } from "#wow/control-sync";
import type { TransportRide } from "#wow/control-transport";
import type { Position } from "#wow/entity-store";
import { MovementFlag } from "#wow/protocol/entity-fields";
import { buildMoveMessage, type MovementInfo } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { Vec3 } from "#wow/protocol/packet";

export type RideSeat = {
  vehicle: bigint;
  seat: number;
  offset: Vec3;
  facing: number;
  splineId: number | undefined;
  duration: number;
  vehiclePose: Position | undefined;
};

export type RideParts = {
  deps: ControlDeps;
  movementInfo: () => MovementInfo;
  serverPose: (pose: Position) => void;
  cancelForced: (reason: string) => void;
  emit: Emit;
};

export type TimerId = ReturnType<typeof setTimeout>;

export function seatWorldPose(
  vehicle: Position,
  offset: Vec3,
  facing = 0,
): Position {
  const cos = Math.cos(vehicle.orientation);
  const sin = Math.sin(vehicle.orientation);
  return {
    mapId: vehicle.mapId,
    orientation: vehicle.orientation + facing,
    x: vehicle.x + offset.x * cos - offset.y * sin,
    y: vehicle.y + offset.y * cos + offset.x * sin,
    z: vehicle.z + offset.z,
  };
}

export class RideState {
  private readonly deps: ControlDeps;
  private readonly movementInfo: () => MovementInfo;
  private readonly serverPose: (pose: Position) => void;
  private readonly cancelForced: (reason: string) => void;
  private readonly emit: Emit;
  private seat: RideSeat | undefined;
  private splineTimer: TimerId | undefined;
  private transportRide: TransportRide | undefined;

  constructor(parts: RideParts) {
    this.deps = parts.deps;
    this.movementInfo = parts.movementInfo;
    this.serverPose = parts.serverPose;
    this.cancelForced = parts.cancelForced;
    this.emit = parts.emit;
  }

  get riding(): boolean {
    return this.seat !== undefined;
  }

  get onTransport(): boolean {
    return this.transportRide !== undefined;
  }

  get transportGuid(): bigint | undefined {
    return this.transportRide?.guid;
  }

  boardTransport(ride: TransportRide): void {
    this.transportRide = ride;
    this.cancelForced("transport");
    this.serverPose(seatWorldPose(ride.pose, ride.offset));
    this.emit("control_changed", "transport");
  }

  leaveTransport(): void {
    this.transportRide = undefined;
    this.emit("control_changed", undefined);
  }

  carriage(): TransportRide | undefined {
    return this.transportRide;
  }

  refreshPose(): void {
    const ride = this.transportRide;
    const at = ride?.poseAt(this.deps.now());
    if (ride && at) ride.pose = { ...at };
  }

  board(seat: RideSeat): void {
    clearTimeout(this.splineTimer);
    this.splineTimer = undefined;
    this.seat = seat;
    this.cancelForced("transport");
    if (seat.vehiclePose)
      this.serverPose(
        seatWorldPose(seat.vehiclePose, seat.offset, seat.facing),
      );
    this.emit("control_changed", "transport");
    if (seat.splineId === undefined) return;
    this.splineTimer = setTimeout(() => {
      this.splineTimer = undefined;
      this.sendSplineDone();
    }, seat.duration);
  }

  leave(): void {
    if (this.seat === undefined && this.splineTimer === undefined) return;
    clearTimeout(this.splineTimer);
    this.splineTimer = undefined;
    this.seat = undefined;
    this.emit("control_changed", undefined);
  }

  clear(): void {
    clearTimeout(this.splineTimer);
    this.splineTimer = undefined;
    this.seat = undefined;
    this.transportRide = undefined;
  }

  apply(info: MovementInfo): MovementInfo {
    this.refreshPose();
    const ride = this.transportRide;
    if (ride) {
      const carried = seatWorldPose(ride.pose, ride.offset);
      return {
        ...info,
        flags: info.flags | MovementFlag.ON_TRANSPORT,
        orientation: carried.orientation,
        transport: {
          guid: ride.guid,
          orientation: 0,
          seat: 0,
          time: info.time,
          x: ride.offset.x,
          y: ride.offset.y,
          z: ride.offset.z,
        },
        x: carried.x,
        y: carried.y,
        z: carried.z,
      };
    }
    const seat = this.seat;
    if (!seat) return info;
    return {
      ...info,
      flags: info.flags | MovementFlag.ON_TRANSPORT,
      transport: {
        guid: seat.vehicle,
        orientation: seat.facing,
        seat: seat.seat,
        time: info.time,
        x: seat.offset.x,
        y: seat.offset.y,
        z: seat.offset.z,
      },
    };
  }

  dispose(): void {
    clearTimeout(this.splineTimer);
    this.splineTimer = undefined;
    this.seat = undefined;
    this.transportRide = undefined;
  }

  private sendSplineDone(): void {
    const seat = this.seat;
    if (seat?.splineId === undefined) return;
    const info = this.movementInfo();
    const head = buildMoveMessage(this.deps.selfGuid(), info);
    const body = new Uint8Array(head.byteLength + 4);
    body.set(head, 0);
    new DataView(body.buffer).setUint32(head.byteLength, seat.splineId, true);
    this.deps.send(GameOpcode.CMSG_MOVE_SPLINE_DONE, body);
  }
}
