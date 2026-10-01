import type { ControlDeps, ControlPose } from "#wow/control";
import {
  DEFAULT_TURN_RATE,
  INPUT_BITS,
  type MovementInput,
} from "#wow/control-input";
import { unsupportedReason } from "#wow/control-motion";
import {
  type MoverState,
  PassengerFlags,
  type RideSeat,
  RideState,
  SelfMotion,
  withoutDrivenFields,
} from "#wow/control-ride";
import { AIR_INPUT_BITS } from "#wow/control-swim";
import { ServerAckSync } from "#wow/control-sync-acks";
import { ForcedRoots, flagTarget } from "#wow/control-sync-forced";
import {
  canFlyFlags,
  type FlagSources,
  forcedPoseFlags,
  RECONCILED_BITS,
  TransferAbortWatch,
  UNIT_BLOCK_FLAGS,
  unsupportedFlags,
} from "#wow/control-sync-guards";
import type {
  Emit,
  FlightPort,
  SelfObservation,
  SyncMotion,
  SyncParts,
} from "#wow/control-sync-types";
import type { Position } from "#wow/entity-store";
import { MovementFlag } from "#wow/protocol/entity-fields";
import type { MonsterMove } from "#wow/protocol/monster-move";
import {
  buildRootAck,
  buildSetActiveMover,
  buildTeleportAck,
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

export class MovementSync {
  predicted: ControlPose | undefined;
  server: ControlPose | undefined;
  moveFlags = 0;
  observedFlags = 0;
  drivenFlags = 0;
  vehicleCanFly = false;
  mapId = 0;
  runSpeed: number | undefined;
  runBackSpeed: number | undefined;
  turnRate = DEFAULT_TURN_RATE;
  fall: FallData | undefined;
  fallTime = 0;
  pitch: number | undefined;
  target: bigint | undefined;
  private readonly deps: ControlDeps;
  private readonly emit: Emit;
  private readonly motion: SyncMotion;
  private extraFlags = 0;
  private transport: TransportInfo | undefined;
  private flight: FlightPort | undefined;
  readonly ride: RideState;
  private readonly selfMotion = new SelfMotion();
  readonly passenger = new PassengerFlags();
  private controlAllowed = true;
  rooted = false;
  moverRooted = false;
  moverRootKnown = false;
  readonly pendingRoots = new Map<bigint, boolean>();
  private teleporting = false;
  private unitBlocked = false;
  private readonly transferAbort = new TransferAbortWatch();
  private readonly acks: ServerAckSync;
  private readonly forced: ForcedRoots;

  constructor({ deps, emit, motion, flight }: SyncParts) {
    this.deps = deps;
    this.emit = emit;
    this.motion = motion;
    this.flight = flight;
    this.acks = new ServerAckSync({ deps, emit, host: this, motion });
    this.forced = new ForcedRoots({ deps, host: this });
    this.ride = new RideState({
      cancelForced: (reason) => this.cancelForced(reason),
      deps,
      emit,
      movementInfo: () => this.movementInfo(),
      moverChanged: (mover) => this.moverChanged(mover),
      serverPose: (pose) => this.adoptServerPose(pose),
    });
  }
  pose(): ControlPose | undefined {
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
      unsupportedReason(unsupportedFlags(this.flagSources())) ??
      (this.ride.riding && !this.ride.controlling ? "transport" : undefined)
    );
  }

  get mover(): bigint | undefined {
    return this.ride.moverGuid;
  }

  moverGuid(): bigint {
    return this.ride.moverGuid ?? this.deps.selfGuid();
  }

  moverState(state: MoverState): void {
    if (this.ride.moverGuid !== state.guid) return;
    if (state.run !== undefined) this.runSpeed = state.run;
    if (state.runBack !== undefined) this.runBackSpeed = state.runBack;
    if (state.turn !== undefined) this.turnRate = state.turn;
    if (state.flags !== undefined) this.forced.adoptFlags(state.flags);
    if (state.pose)
      this.adoptServerPose({
        ...state.pose,
        mapId: this.mapId || state.pose.mapId,
      });
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
    this.moverRootKnown = false;
    this.pendingRoots.clear();
    this.ride.leave();
  }

  airBlock(): string | undefined {
    if (this.teleporting) return "teleporting";
    if (this.flight?.inFlight() ?? false) return "in_flight";
    if (this.ride.controlling ? this.moverRooted : this.rooted) return "rooted";
    if (!this.controlAllowed) return "no_control";
    if (this.unitBlocked) return "disable_move";
  }

  isDriving(): boolean {
    return this.ride.controlling;
  }

  canFly(): boolean {
    return (canFlyFlags(this.flagSources()) & MovementFlag.CAN_FLY) !== 0;
  }

  private flagSources(): FlagSources {
    const controlling = this.ride.controlling;
    return {
      controlling,
      drivenFlags:
        this.drivenFlags |
        (controlling && this.vehicleCanFly ? MovementFlag.CAN_FLY : 0),
      moveFlags: this.moveFlags,
      observedFlags: this.observedFlags,
    };
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

  observeSelf(observed: SelfObservation): void {
    const driving = this.ride.controlling;
    const input = driving ? withoutDrivenFields(observed) : observed;
    if (input.runSpeed !== undefined) this.runSpeed = input.runSpeed;
    if (input.runBackSpeed !== undefined)
      this.runBackSpeed = input.runBackSpeed;
    if (input.turnRate !== undefined) this.turnRate = input.turnRate;
    if (input.unitFlags !== undefined) this.setUnitFlags(input.unitFlags);
    if (input.target !== undefined) this.observeTarget(input.target);
    if (driving && observed.movementFlags !== undefined) {
      this.passenger.observe(observed.movementFlags);
      this.rooted = (observed.movementFlags & MovementFlag.ROOT) !== 0;
    } else if (input.movementFlags !== undefined)
      this.observeFlags(input.movementFlags);
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

  private observeFlags(flags: number): void {
    this.observedFlags = flags;
    this.rooted = (flags & MovementFlag.ROOT) !== 0;
    if (this.rooted) this.moveFlags |= MovementFlag.ROOT;
    else this.moveFlags &= ~MovementFlag.ROOT;
  }

  observeTarget(target: bigint): void {
    if (this.target === target) return;
    this.target = target;
    this.emit("target_observed");
  }

  teleportAck({ counter, info: dest }: MoveAck): void {
    this.transferAbort.cancel();
    this.teleporting = false;
    this.cancelForced("teleport");
    this.deps.send(
      GameOpcode.MSG_MOVE_TELEPORT_ACK,
      buildTeleportAck(this.deps.selfGuid(), counter, this.deps.ticks()),
    );
    this.applyForcedPose(dest, "teleport");
  }

  nearTeleport(dest: MovementInfo): void {
    this.transferAbort.cancel();
    this.teleporting = false;
    this.cancelForced("near_teleport");
    this.applyForcedPose(dest, "near_teleport");
  }

  handleTransferPending(): void {
    this.transferAbort.cancel();
    this.teleporting = true;
    this.cancelForced("teleport");
    this.emit("control_changed", "teleporting");
  }

  transferAborted(_abort: TransferAbortedInput): void {
    if (!this.teleporting) return;
    this.transferAbort.start(() => {
      this.teleporting = false;
      this.motion.stop("transfer_aborted");
      this.emit("control_changed", undefined);
    });
  }

  dispose(): void {
    this.transferAbort.cancel();
    this.ride.dispose();
  }

  newWorld(position: Position): void {
    this.transferAbort.cancel();
    this.teleporting = false;
    this.flight?.newWorld();
    this.transport = undefined;
    this.ride.clear();
    this.mapId = position.mapId;
    this.moveFlags = 0;
    this.observedFlags = 0;
    this.drivenFlags = 0;
    this.vehicleCanFly = false;
    this.extraFlags = 0;
    this.fall = undefined;
    this.pitch = undefined;
    this.fallTime = 0;
    this.rooted = false;
    this.moverRooted = false;
    this.moverRootKnown = false;
    this.pendingRoots.clear();
    this.setServerPose(position);
    this.predicted = undefined;
    this.deps.send(GameOpcode.MSG_MOVE_WORLDPORT_ACK);
    this.deps.send(
      GameOpcode.CMSG_SET_ACTIVE_MOVER,
      buildSetActiveMover(this.deps.selfGuid()),
    );
    this.emit("server_correction", "new_world");
  }

  forceRoot(counter: number, guid?: bigint): void {
    const mover = this.ride.moverGuid;
    if (mover !== undefined && guid === mover) this.forced.setMover(true);
    else this.forced.notePending(mover, guid, true);
    this.cancelForced("root");
    this.ackRoot(GameOpcode.CMSG_FORCE_MOVE_ROOT_ACK, counter);
    this.emit("control_changed", "rooted");
  }

  forceUnroot(counter: number, guid?: bigint): void {
    const mover = this.ride.moverGuid;
    if (mover !== undefined && guid === mover) this.forced.setMover(false);
    else this.forced.notePending(mover, guid, false);
    this.cancelForced("root");
    this.ackRoot(GameOpcode.CMSG_FORCE_MOVE_UNROOT_ACK, counter);
    this.emit("control_changed", undefined);
  }

  knockBack(knock: KnockBack): void {
    this.acks.knockBack(knock);
  }

  clientControl({ guid, allow }: ClientControl): void {
    const self = this.deps.selfGuid();
    if (guid !== 0n && guid !== self) {
      const ridden = this.ride.control(guid, allow);
      if (ridden !== "refused") {
        this.controlAllowed = true;
        if (ridden === "cleared") this.emit("control_changed", undefined);
        return;
      }
      this.controlAllowed = false;
      this.cancelForced("no_control");
      this.emit("control_changed", "no_control");
      return;
    }
    this.controlAllowed = allow;
    if (!allow) this.cancelForced("no_control");
    this.emit("control_changed", allow ? undefined : "no_control");
  }

  forceSpeed(spec: SpeedAck, force: ForceSpeed): void {
    this.acks.forceSpeed(spec, force);
  }

  setCanFly(counter: number, enable: boolean): void {
    this.acks.setCanFly(counter, enable);
  }

  moveFlag(
    flag: MoveFlag,
    enable: boolean,
    counter: number,
    guid?: bigint,
  ): void {
    const target = flagTarget(this.ride.moverGuid, this.deps.selfGuid(), guid);
    if (target === "drop") return;
    this.acks.moveFlag(flag, enable, counter, target === "driven");
  }

  collisionHeight(counter: number, height: number): void {
    this.acks.collisionHeight(counter, height);
  }

  timeSkipped(ms: number): void {
    this.acks.timeSkipped(ms);
  }

  resetFall(): void {
    this.acks.resetFall();
  }

  moveAck(counter: number): MoveAck {
    return { guid: this.moverGuid(), counter, info: this.movementInfo() };
  }
  private ackRoot(opcode: number, counter: number): void {
    this.deps.send(opcode, buildRootAck(this.moveAck(counter)));
  }

  cancelForced(reason: string): void {
    this.motion.abort(reason);
    this.moveFlags &= ~(INPUT_BITS | AIR_INPUT_BITS);
  }
  private reconciled(): number {
    const driven = this.ride.controlling ? this.forced.drivenBits() : 0;
    const vehicleFly =
      this.ride.controlling && this.vehicleCanFly ? MovementFlag.CAN_FLY : 0;
    return (
      this.moveFlags |
      (this.observedFlags & RECONCILED_BITS) |
      driven |
      vehicleFly
    );
  }

  private moverChanged(mover: bigint | undefined): void {
    this.controlAllowed = true;
    this.drivenFlags = 0;
    this.vehicleCanFly = false;
    this.forced.adoptMover(mover);
    this.moverRooted =
      mover !== undefined && (this.pendingRoots.get(mover) ?? false);
    this.forced.forget(mover);
    if (mover === undefined) {
      this.passenger.restore(this);
      this.moveFlags &= ~MovementFlag.ROOT;
      if (this.rooted) this.moveFlags |= MovementFlag.ROOT;
      this.selfMotion.restore(this);
      return;
    }
    this.passenger.save(this);
    if (this.moverRooted) this.moveFlags |= MovementFlag.ROOT;
    else this.moveFlags &= ~MovementFlag.ROOT;
    this.selfMotion.save(this);
  }

  private adoptServerPose(position: Position): void {
    this.setServerPose(position);
    this.predicted = undefined;
  }

  private setServerPose(position: Position): void {
    this.server = { ...position, source: "server", updatedAt: this.deps.now() };
  }

  private applyForcedPose(dest: MovementInfo, reason: string): void {
    this.ride.clear();
    if (
      dest.transport !== undefined &&
      (dest.flags & MovementFlag.ON_TRANSPORT) !== 0
    )
      this.transport = { ...dest.transport };
    else this.transport = undefined;
    const pose = forcedPoseFlags({
      flags: dest.flags,
      hasTransport: dest.transport !== undefined,
      inputBits: INPUT_BITS,
    });
    this.observedFlags = pose.observed;
    this.extraFlags = dest.extraFlags;
    this.moveFlags = pose.move;
    this.vehicleCanFly = false;
    this.fall = dest.fall;
    this.fallTime = dest.fallTime;
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
