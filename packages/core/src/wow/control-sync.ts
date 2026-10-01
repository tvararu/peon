import type { ControlDeps, ControlEventType, ControlPose } from "#wow/control";
import { FLAG_ACKS } from "#wow/control-flag-acks";
import {
  DEFAULT_TURN_RATE,
  INPUT_BITS,
  type MovementInput,
} from "#wow/control-input";
import { unsupportedReason } from "#wow/control-motion";
import { type RideSeat, RideState } from "#wow/control-ride";
import { AIR_INPUT_BITS } from "#wow/control-swim";
import { ForcedAcks, TransferAbortWatch } from "#wow/control-sync-acks";
import { WorldTransfer } from "#wow/control-sync-transfer";

import {
  planBoard,
  planLeave,
  type TransportBoard,
} from "#wow/control-transport";
import type { Position } from "#wow/entity-store";
import { MovementFlag, UnitFlag } from "#wow/protocol/entity-fields";
import type { MonsterMove } from "#wow/protocol/monster-move";
import {
  buildMoveMessage,
  buildSetActiveMover,
  type ClientControl,
  type FallData,
  type ForceSpeed,
  type KnockBack,
  type MoveAck,
  type MovementInfo,
  type SpeedAck,
  type TransportInfo,
} from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { MoveFlag, TransferAbortedInput } from "#wow/self-store";

const RECONCILED_BITS =
  MovementFlag.SWIMMING | MovementFlag.FLYING | MovementFlag.CAN_FLY;

const UNIT_BLOCK_FLAGS =
  UnitFlag.DISABLE_MOVE |
  UnitFlag.STUNNED |
  UnitFlag.CONFUSED |
  UnitFlag.FLEEING;

export type Emit = (type: ControlEventType, reason?: string) => void;

export type SyncMotion = {
  moving: () => boolean;
  settle: () => void;
  abort: (reason: string) => void;
  stop: (reason: string) => void;
};

export type SelfObservation = {
  position?: Position;
  movementFlags?: number;
  runSpeed?: number;
  runBackSpeed?: number;
  turnRate?: number;
  target?: bigint;
  unitFlags?: number;
};

export type SyncParts = {
  deps: ControlDeps;
  emit: Emit;
  motion: SyncMotion;
  flight?: FlightPort | undefined;
};
export type FlightPort = {
  inFlight: () => boolean;
  newWorld: () => void;
  observeSpline: (move: MonsterMove) => boolean;
  observeUnitFlags: (unitFlags: number) => boolean;
};
export class MovementSync {
  predicted: ControlPose | undefined;
  server: ControlPose | undefined;
  moveFlags = 0;
  observedFlags = 0;
  mapId = 0;
  runSpeed: number | undefined;
  runBackSpeed: number | undefined;
  turnRate = DEFAULT_TURN_RATE;
  fall: FallData | undefined;
  fallTime = 0;
  pitch: number | undefined;
  target: bigint | undefined;
  readonly deps: ControlDeps;
  readonly emit: Emit;
  readonly motion: SyncMotion;
  extraFlags = 0;
  transport: TransportInfo | undefined;
  flight: FlightPort | undefined;
  readonly ride: RideState;
  controlAllowed = true;
  rooted = false;
  teleporting = false;
  transportTransfer = false;
  unitBlocked = false;
  readonly abortWatch = new TransferAbortWatch();
  private readonly acks: ForcedAcks;
  private readonly transfer: WorldTransfer;

  constructor({ deps, emit, motion, flight }: SyncParts) {
    this.deps = deps;
    this.emit = emit;
    this.motion = motion;
    this.flight = flight;
    this.acks = new ForcedAcks(deps, (counter) => this.moveAck(counter));
    this.transfer = new WorldTransfer(this);
    this.ride = new RideState({
      cancelForced: (reason) => this.cancelForced(reason),
      deps,
      emit,
      movementInfo: () => this.movementInfo(),
      serverPose: (pose) => this.adoptServerPose(pose),
    });
  }

  pose(): ControlPose | undefined {
    const carried = this.ride.carriedPose();
    if (carried)
      return { ...carried, source: "server", updatedAt: this.deps.now() };
    return this.predicted ?? this.server;
  }

  requirePose(): ControlPose {
    const pose = this.pose();
    if (!pose) throw new Error("no_pose");
    return { ...pose };
  }

  speedFor(input: MovementInput): number | undefined {
    return input.move === "backward" ? this.runBackSpeed : this.runSpeed;
  }

  blockReason(): string | undefined {
    return (
      this.airBlock() ??
      unsupportedReason(
        this.observedFlags |
          (this.moveFlags &
            (MovementFlag.SWIMMING | MovementFlag.FLYING | AIR_INPUT_BITS)),
      ) ??
      (this.ride.riding || this.ride.onTransport ? "transport" : undefined)
    );
  }

  vehicleSeat(seat: RideSeat): void {
    this.moveFlags |= MovementFlag.ON_TRANSPORT;
    this.observedFlags |= MovementFlag.ON_TRANSPORT;
    this.ride.board(seat);
  }

  vehicleLeft(): void {
    this.transport = undefined;
    this.moveFlags &= ~MovementFlag.ON_TRANSPORT;
    this.observedFlags &= ~MovementFlag.ON_TRANSPORT;
    this.ride.leave();
  }

  transportBoard(board: TransportBoard): void {
    const from = this.pose();
    if (!from) throw new Error("no_pose");
    const plan = planBoard(board, from, this.deps.now());
    this.transport = undefined;
    this.ride.boardTransport(plan);
    this.moveFlags |= MovementFlag.ON_TRANSPORT;
    this.observedFlags |= MovementFlag.ON_TRANSPORT;
    const body = buildMoveMessage(this.deps.selfGuid(), this.movementInfo());
    this.deps.send(GameOpcode.CMSG_MOVE_CHNG_TRANSPORT, body);
  }

  transportLeave(): void {
    this.ride.refreshPose();
    const ride = this.ride.carriage();
    if (!ride) throw new Error("not_boarded");
    const dest = planLeave(ride, this.mapId, this.deps.ground);
    this.transport = undefined;
    this.moveFlags &= ~MovementFlag.ON_TRANSPORT;
    this.observedFlags &= ~MovementFlag.ON_TRANSPORT;
    this.adoptServerPose(dest);
    this.motion.stop("transport_leave");
    this.ride.leaveTransport();
    const body = buildMoveMessage(this.deps.selfGuid(), this.movementInfo());
    this.deps.send(GameOpcode.CMSG_MOVE_CHNG_TRANSPORT, body);
  }

  airBlock(): string | undefined {
    if (this.teleporting) return "teleporting";
    if (this.flight?.inFlight() ?? false) return "in_flight";
    if (this.rooted) return "rooted";
    if (!this.controlAllowed) return "no_control";
    if (this.unitBlocked) return "disable_move";
    return undefined;
  }

  canFly(): boolean {
    return ((this.observedFlags | this.moveFlags) & MovementFlag.CAN_FLY) !== 0;
  }

  setFlight(flight: FlightPort): void {
    this.flight = flight;
  }

  restoreFlightBlocker(blockers: number): void {
    this.unitBlocked = (blockers & UNIT_BLOCK_FLAGS) !== 0;
  }

  setFlightPose(pose: Position): void {
    this.setServerPose(pose);
    this.predicted = undefined;
  }
  observeSelfSpline(move: MonsterMove): void {
    this.flight?.observeSpline(move);
  }

  movementInfo(): MovementInfo {
    const pose = this.pose();
    const base = {
      extraFlags: this.extraFlags,
      fall: this.fall,
      fallTime: this.fallTime,
      flags: this.reconciled(),
      orientation: pose?.orientation ?? 0,
      pitch: this.pitch,
      time: this.deps.ticks(),
      x: pose?.x ?? 0,
      y: pose?.y ?? 0,
      z: pose?.z ?? 0,
    };
    if (this.transport !== undefined && !this.ride.riding)
      return {
        ...base,
        flags: base.flags | MovementFlag.ON_TRANSPORT,
        transport: { ...this.transport, time: base.time },
      };
    return this.ride.apply(base);
  }

  loginVerified(position: Position): void {
    this.mapId = position.mapId;
    this.setServerPose(position);
    this.predicted = undefined;
    this.deps.send(
      GameOpcode.CMSG_SET_ACTIVE_MOVER,
      buildSetActiveMover(this.deps.selfGuid()),
    );
  }

  observeSelf(input: SelfObservation): void {
    if (input.runSpeed !== undefined) this.runSpeed = input.runSpeed;
    if (input.runBackSpeed !== undefined)
      this.runBackSpeed = input.runBackSpeed;
    if (input.turnRate !== undefined) this.turnRate = input.turnRate;
    if (input.unitFlags !== undefined) this.setUnitFlags(input.unitFlags);
    if (input.target !== undefined) this.observeTarget(input.target);
    if (input.movementFlags !== undefined) {
      this.observedFlags = input.movementFlags;
      this.rooted = (input.movementFlags & MovementFlag.ROOT) !== 0;
      if (this.rooted) this.moveFlags |= MovementFlag.ROOT;
      else this.moveFlags &= ~MovementFlag.ROOT;
    }
    if (input.position) {
      const stamped = {
        ...input.position,
        mapId: this.mapId || input.position.mapId,
      };
      this.server = {
        ...stamped,
        source: "server",
        updatedAt: this.deps.now(),
      };
      this.moveFlags &= ~(INPUT_BITS | AIR_INPUT_BITS);
      if (this.motion.moving()) {
        this.cancelForced("server_correction");
        this.predicted = undefined;
        this.emit("server_correction", "observed");
        return;
      }
      this.predicted = undefined;
    }
    const unsafe = this.blockReason();
    if (this.motion.moving() && unsafe) this.cancelForced(unsafe);
  }

  observeTarget(target: bigint): void {
    if (this.target === target) return;
    this.target = target;
    this.emit("target_observed");
  }

  teleportAck(ack: MoveAck): void {
    this.transfer.teleportAck(ack);
  }

  nearTeleport(dest: MovementInfo): void {
    this.transfer.nearTeleport(dest);
  }

  handleTransferPending(transport?: { entry: number; fromMap: number }): void {
    this.transfer.handleTransferPending(transport);
  }

  transferAborted(abort: TransferAbortedInput): void {
    this.transfer.transferAborted(abort);
  }

  dispose(): void {
    this.abortWatch.cancel();
    this.ride.dispose();
  }

  newWorld(position: Position): void {
    this.transfer.newWorld(position);
  }

  forceRoot(counter: number): void {
    this.rooted = true;
    this.cancelForced("root");
    this.moveFlags |= MovementFlag.ROOT;
    this.acks.root(GameOpcode.CMSG_FORCE_MOVE_ROOT_ACK, counter);
    this.emit("control_changed", "rooted");
  }

  forceUnroot(counter: number): void {
    this.rooted = false;
    this.moveFlags &= ~MovementFlag.ROOT;
    this.acks.root(GameOpcode.CMSG_FORCE_MOVE_UNROOT_ACK, counter);
    this.emit("control_changed", undefined);
  }

  knockBack({ counter, fall }: KnockBack): void {
    this.cancelForced("knockback");
    this.observedFlags |= MovementFlag.FALLING;
    this.moveFlags |= MovementFlag.FALLING;
    this.fall = fall;
    this.acks.root(GameOpcode.CMSG_MOVE_KNOCK_BACK_ACK, counter);
    this.emit("server_correction", "knockback");
  }

  clientControl({ guid, allow }: ClientControl): void {
    const self = this.deps.selfGuid();
    if (guid !== 0n && guid !== self) {
      this.controlAllowed = false;
      this.cancelForced("no_control");
      this.emit("control_changed", "no_control");
      return;
    }
    this.controlAllowed = allow;
    if (!allow) this.cancelForced("no_control");
    this.emit("control_changed", allow ? undefined : "no_control");
  }

  forceSpeed(spec: SpeedAck, { counter, speed }: ForceSpeed): void {
    this.motion.settle();
    if ("field" in spec && spec.field === "runSpeed") this.runSpeed = speed;
    if ("field" in spec && spec.field === "runBackSpeed")
      this.runBackSpeed = speed;
    if ("field" in spec && spec.field === "turnRate") this.turnRate = speed;
    this.acks.speed(spec, counter, speed);
  }

  setCanFly(counter: number, enable: boolean): void {
    this.cancelForced(enable ? "flying" : "unset_can_fly");
    if (enable) {
      this.observedFlags |= MovementFlag.CAN_FLY;
      this.moveFlags |= MovementFlag.CAN_FLY;
    } else {
      this.observedFlags &= ~(MovementFlag.CAN_FLY | MovementFlag.FLYING);
      this.moveFlags &= ~(
        MovementFlag.CAN_FLY |
        MovementFlag.FLYING |
        AIR_INPUT_BITS
      );
    }
    this.acks.canFly(counter, enable);
    this.emit("control_changed", enable ? "flying" : undefined);
  }

  moveFlag(flag: MoveFlag, enable: boolean, counter: number): void {
    const { bit } = FLAG_ACKS[flag];
    if (enable) {
      this.observedFlags |= bit;
      this.moveFlags |= bit;
    } else {
      this.observedFlags &= ~bit;
      this.moveFlags &= ~bit;
    }
    this.acks.flag(flag, enable, counter);
  }

  collisionHeight(counter: number, height: number): void {
    this.acks.collisionHeight(counter, height);
  }

  timeSkipped(ms: number): void {
    this.acks.timeSkipped(ms);
  }

  resetFall(): void {
    this.fall = undefined;
    this.fallTime = 0;
    this.observedFlags &= ~MovementFlag.FALLING;
    this.moveFlags &= ~MovementFlag.FALLING;
    this.deps.send(
      GameOpcode.CMSG_MOVE_FALL_RESET,
      buildMoveMessage(this.deps.selfGuid(), this.movementInfo()),
    );
  }
  cancelForced(reason: string): void {
    this.motion.abort(reason);
    this.moveFlags &= ~(INPUT_BITS | AIR_INPUT_BITS);
  }

  private reconciled(): number {
    return this.moveFlags | (this.observedFlags & RECONCILED_BITS);
  }

  private moveAck(counter: number): MoveAck {
    return { guid: this.deps.selfGuid(), counter, info: this.movementInfo() };
  }

  private adoptServerPose(position: Position): void {
    this.setServerPose(position);
    this.predicted = undefined;
  }

  setServerPose(position: Position): void {
    this.server = { ...position, source: "server", updatedAt: this.deps.now() };
  }

  applyForcedPose(dest: MovementInfo, reason: string): void {
    const ride = this.ride.carriage();
    const offset = dest.transport;
    if (
      ride !== undefined &&
      offset !== undefined &&
      offset.guid === ride.guid &&
      (dest.flags & MovementFlag.ON_TRANSPORT) !== 0
    )
      ride.offset = { x: offset.x, y: offset.y, z: offset.z };
    else this.ride.clear();
    if (
      dest.transport !== undefined &&
      (dest.flags & MovementFlag.ON_TRANSPORT) !== 0
    )
      this.transport = { ...dest.transport };
    else this.transport = undefined;
    const keep =
      dest.transport !== undefined &&
      (dest.flags & MovementFlag.ON_TRANSPORT) !== 0
        ? MovementFlag.ON_TRANSPORT
        : 0;
    this.observedFlags = (dest.flags & ~MovementFlag.ON_TRANSPORT) | keep;
    this.extraFlags = dest.extraFlags;
    this.moveFlags =
      (dest.flags & ~INPUT_BITS & ~MovementFlag.ON_TRANSPORT) | keep;
    this.fall = dest.fall;
    this.pitch = dest.pitch;
    this.rooted = (dest.flags & MovementFlag.ROOT) !== 0;
    this.setServerPose({
      mapId: this.mapId,
      x: dest.x,
      y: dest.y,
      z: dest.z,
      orientation: dest.orientation,
    });
    this.predicted = undefined;
    this.emit("server_correction", reason);
  }

  private setUnitFlags(unitFlags: number): void {
    const wasFlying = this.flight?.inFlight() ?? false;
    const wasBlocked = this.unitBlocked;
    const blocked = (unitFlags & UNIT_BLOCK_FLAGS) !== 0;
    if (!wasFlying) this.unitBlocked = blocked;
    this.flight?.observeUnitFlags(unitFlags);
    if (this.flight?.inFlight() ?? false) return;
    if (wasFlying || blocked === wasBlocked) return;
    if (blocked) {
      this.motion.stop("disable_move");
      this.moveFlags &= ~(INPUT_BITS | AIR_INPUT_BITS);
    }
    this.emit("control_changed", blocked ? "disable_move" : undefined);
  }
}
