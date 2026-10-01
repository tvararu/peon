import type { ControlDeps } from "#wow/control";
import { INPUT_BITS } from "#wow/control-input";
import { AIR_INPUT_BITS } from "#wow/control-swim";
import type { Emit, SelfObservation } from "#wow/control-sync-types";
import type { TransportRide } from "#wow/control-transport";
import type { Position } from "#wow/entity-store";
import { MovementFlag } from "#wow/protocol/entity-fields";
import {
  buildMoveMessage,
  buildSetActiveMover,
  type MovementInfo,
} from "#wow/protocol/movement";
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

export type MoverState = {
  guid: bigint;
  run: number | undefined;
  runBack: number | undefined;
  turn: number | undefined;
  pose: Position | undefined;
  flags?: number | undefined;
};

export type MotionSpeeds = {
  runSpeed: number | undefined;
  runBackSpeed: number | undefined;
  turnRate: number;
};

export class SelfMotion {
  private saved: MotionSpeeds | undefined;

  save({ runSpeed, runBackSpeed, turnRate }: MotionSpeeds): void {
    this.saved = { runBackSpeed, runSpeed, turnRate };
  }

  restore(target: MotionSpeeds): void {
    if (!this.saved) return;
    target.runSpeed = this.saved.runSpeed;
    target.runBackSpeed = this.saved.runBackSpeed;
    target.turnRate = this.saved.turnRate;
    this.saved = undefined;
  }
}

type FlagBits = { moveFlags: number; observedFlags: number };

export class PassengerFlags {
  private saved: { move: number; observed: number } | undefined;

  save(host: FlagBits): void {
    if (this.saved) return;
    this.saved = {
      move:
        host.moveFlags &
        ~(
          INPUT_BITS |
          AIR_INPUT_BITS |
          MovementFlag.ROOT |
          MovementFlag.ON_TRANSPORT
        ),
      observed: host.observedFlags & ~MovementFlag.ON_TRANSPORT,
    };
    host.moveFlags &= MovementFlag.ON_TRANSPORT;
    host.observedFlags &= MovementFlag.ON_TRANSPORT;
  }

  observe(flags: number): void {
    if (this.saved) this.saved.observed = flags & ~MovementFlag.ON_TRANSPORT;
  }

  set(bit: number, enable: boolean): void {
    if (!this.saved) return;
    if (enable) {
      this.saved.move |= bit;
      this.saved.observed |= bit;
    } else {
      this.saved.move &= ~bit;
      this.saved.observed &= ~bit;
    }
  }

  restore(host: FlagBits): void {
    if (!this.saved) return;
    host.moveFlags =
      this.saved.move | (host.moveFlags & MovementFlag.ON_TRANSPORT);
    host.observedFlags =
      this.saved.observed | (host.observedFlags & MovementFlag.ON_TRANSPORT);
    this.saved = undefined;
  }
}

export function withoutDrivenFields(input: SelfObservation): SelfObservation {
  const { movementFlags, position, runSpeed, runBackSpeed, turnRate, ...rest } =
    input;
  if (movementFlags === undefined) return rest;
  return { ...rest, movementFlags: movementFlags & MovementFlag.ON_TRANSPORT };
}

export type RideControl = "taken" | "dropped" | "cleared" | "refused";

export type RideParts = {
  deps: ControlDeps;
  movementInfo: () => MovementInfo;
  serverPose: (pose: Position) => void;
  cancelForced: (reason: string) => void;
  moverChanged: (mover: bigint | undefined) => void;
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
  private readonly moverChanged: RideParts["moverChanged"];
  private readonly emit: Emit;
  private seat: RideSeat | undefined;
  private mover: bigint | undefined;
  private pendingMover: bigint | undefined;
  private splineTimer: TimerId | undefined;
  private transportRide: TransportRide | undefined;

  constructor(parts: RideParts) {
    this.deps = parts.deps;
    this.movementInfo = parts.movementInfo;
    this.serverPose = parts.serverPose;
    this.cancelForced = parts.cancelForced;
    this.moverChanged = parts.moverChanged;
    this.emit = parts.emit;
  }

  get riding(): boolean {
    return this.seat !== undefined;
  }

  get controlling(): boolean {
    return this.mover !== undefined;
  }

  get moverGuid(): bigint | undefined {
    return this.mover;
  }

  control(guid: bigint, allow: boolean): RideControl {
    if (allow) {
      if (this.seat?.vehicle === guid) {
        this.takeMover(guid);
        return "taken";
      }
      if (this.seat === undefined) this.pendingMover = guid;
      return "refused";
    }
    if (this.mover === guid) {
      this.dropMover();
      return "dropped";
    }
    if (this.pendingMover === guid || this.seat?.vehicle === guid) {
      this.pendingMover = undefined;
      return "cleared";
    }
    return "refused";
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

  rebaseTransport(mapId: number, local: Vec3): void {
    const ride = this.transportRide;
    if (!ride) return;
    ride.offset = { ...local };
    ride.pose = { mapId, moving: true, orientation: 0, x: 0, y: 0, z: 0 };
  }

  carriage(): TransportRide | undefined {
    return this.transportRide;
  }

  carriedPose(): Position | undefined {
    this.refreshPose();
    const ride = this.transportRide;
    return ride && seatWorldPose(ride.pose, ride.offset);
  }

  refreshPose(): void {
    const ride = this.transportRide;
    const at = ride?.poseAt(this.deps.now());
    if (ride && at) ride.pose = { ...at };
  }

  board(seat: RideSeat): void {
    clearTimeout(this.splineTimer);
    this.splineTimer = undefined;
    if (this.mover !== undefined && this.mover !== seat.vehicle)
      this.dropMover();
    const driving = this.mover === seat.vehicle;
    this.seat = seat;
    if (!driving) this.cancelForced("transport");
    if (seat.vehiclePose && !driving)
      this.serverPose(
        seatWorldPose(seat.vehiclePose, seat.offset, seat.facing),
      );
    this.emit("control_changed", "transport");
    const pending = this.pendingMover;
    this.pendingMover = undefined;
    if (pending === seat.vehicle && !driving) this.takeMover(pending);
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
    if (this.mover !== undefined) this.dropMover();
    this.seat = undefined;
    this.pendingMover = undefined;
    this.emit("control_changed", undefined);
  }

  clear(): void {
    clearTimeout(this.splineTimer);
    this.splineTimer = undefined;
    this.seat = undefined;
    this.pendingMover = undefined;
    this.transportRide = undefined;
    this.releaseMover();
  }

  apply(info: MovementInfo): MovementInfo {
    const carried = this.carriedPose();
    const ride = this.transportRide;
    if (ride && carried && this.mover === undefined)
      return this.withTransport(ride, carried, info);
    if (!this.seat) return info;
    if (this.mover !== undefined)
      return {
        ...info,
        flags: info.flags & ~MovementFlag.ON_TRANSPORT,
      };
    return this.withSeat(this.seat, info);
  }

  private withTransport(
    ride: TransportRide,
    carried: Position,
    info: MovementInfo,
  ): MovementInfo {
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

  private withSeat(seat: RideSeat, info: MovementInfo): MovementInfo {
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
    this.pendingMover = undefined;
    this.mover = undefined;
    this.transportRide = undefined;
  }

  private sendSwitch(from: bigint, to: bigint, info: MovementInfo): void {
    this.deps.send(
      GameOpcode.CMSG_MOVE_NOT_ACTIVE_MOVER,
      buildMoveMessage(from, info),
    );
    this.deps.send(GameOpcode.CMSG_SET_ACTIVE_MOVER, buildSetActiveMover(to));
  }

  private takeMover(vehicle: bigint): void {
    const own = this.movementInfo();
    this.mover = vehicle;
    this.pendingMover = undefined;
    this.moverChanged(vehicle);
    this.sendSwitch(this.deps.selfGuid(), vehicle, own);
    this.emit("control_changed", "vehicle");
  }

  private dropMover(): void {
    const from = this.mover;
    if (from === undefined) return;
    this.cancelForced("vehicle");
    const last = this.movementInfo();
    this.mover = undefined;
    this.moverChanged(undefined);
    this.sendSwitch(from, this.deps.selfGuid(), last);
    this.emit("control_changed", "vehicle");
  }

  private releaseMover(): void {
    if (this.mover === undefined) return;
    this.mover = undefined;
    this.moverChanged(undefined);
  }

  private sendSplineDone(): void {
    const seat = this.seat;
    if (seat?.splineId === undefined) return;
    const info = this.withSeat(seat, this.movementInfo());
    const head = buildMoveMessage(this.deps.selfGuid(), info);
    const body = new Uint8Array(head.byteLength + 4);
    body.set(head, 0);
    new DataView(body.buffer).setUint32(head.byteLength, seat.splineId, true);
    this.deps.send(GameOpcode.CMSG_MOVE_SPLINE_DONE, body);
  }
}
