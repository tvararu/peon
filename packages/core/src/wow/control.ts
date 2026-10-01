import { Emitter, type Unsubscribe } from "#lib/emitter";
import { FlightTracker } from "#wow/control-flight";
import {
  assertInput,
  inputOf,
  isIdle,
  type MovementDirection,
  type MovementInput,
  sameInput,
} from "#wow/control-input";
import { type GroundOracle, MAX_DURATION_MS } from "#wow/control-motion";
import { type MovementGuide, Mover } from "#wow/control-mover";
import type { MoverState, RideSeat } from "#wow/control-ride";
import { AirMoves, type AscendKind, type PitchKind } from "#wow/control-swim";
import { MovementSync } from "#wow/control-sync";
import type { SelfObservation } from "#wow/control-sync-types";
import { DirectedWalk } from "#wow/control-walk";
import type { Position } from "#wow/entity-store";
import { bearing, distance2d } from "#wow/geometry";
import type { NavPoint } from "#wow/ground-step";
import type { MonsterMove } from "#wow/protocol/monster-move";
import {
  buildSetSelection,
  type ClientControl,
  type ForceSpeed,
  type KnockBack,
  type MoveAck,
  type MovementInfo,
  type SpeedAck,
} from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { MoveFlag, TransferAbortedInput } from "#wow/self-store";

const FORWARD: MovementInput = { move: "forward" };

export type ControlPose = Position & {
  source: "server" | "predicted";
  updatedAt: number;
};

export type WalkOutcome = {
  status: "completed" | "stopped";
  traveled: number;
  pose: ControlPose;
  reason?: string;
};

export type ControlState = {
  selfGuid: bigint;
  pose: ControlPose | undefined;
  serverPose: ControlPose | undefined;
  target: bigint | undefined;
  requestedTarget: bigint | undefined;
  moving: boolean;
  input: MovementInput;
  airborne: boolean;
  movementAllowed: boolean;
  blockedReason: string | undefined;
  speed: number;
  mover: bigint | undefined;
};

export type ControlEventType =
  | "movement_started"
  | "movement_stopped"
  | "facing_changed"
  | "target_requested"
  | "target_observed"
  | "server_correction"
  | "control_changed"
  | "control_error"
  | "place_changed"
  | "area_explored"
  | "pose_sent";

export type AreaExplored = {
  areaId: number;
  area: string | undefined;
  xp: number;
};

export type ControlEvent = {
  type: ControlEventType;
  state: ControlState;
  reason?: string;
  explored?: AreaExplored;
};

export type ControlSend = (opcode: number, body?: Uint8Array) => void;

export type ControlDeps = {
  send: ControlSend;
  ticks: () => number;
  now: () => number;
  selfGuid: () => bigint;
  ground?: GroundOracle;
};

const MIN_DURATION_MS = 1;

export class ControlRuntime {
  private readonly deps: ControlDeps;
  private readonly events = new Emitter<[ControlEvent]>();
  private readonly sync: MovementSync;
  private readonly mover: Mover;
  private readonly flight: FlightTracker;
  private readonly air: AirMoves;
  private readonly stops = new Emitter<[string]>();
  private requestedTarget: bigint | undefined;

  constructor(deps: ControlDeps) {
    const emit = (type: ControlEventType, reason?: string): void =>
      this.emit(type, reason);
    const motion = {
      moving: () => this.mover.moving || this.mover.airborne,
      settle: () => this.mover.integrate(),
      abort: (reason: string) => this.mover.abort(reason),
      stop: (reason: string) => this.mover.stop(reason, false),
    };
    const interrupt = (reason: string): void => this.stops.emit(reason);
    const emitFlight = (
      type: "control_changed" | "server_correction",
      reason?: string,
    ): void => this.emit(type, reason);
    this.deps = deps;
    this.sync = new MovementSync({ deps, emit, motion });
    this.mover = new Mover({ deps, sync: this.sync, emit, interrupt });
    this.flight = new FlightTracker({
      deps,
      emit: emitFlight,
      motion: {
        abort: (reason: string) => this.mover.abort(reason),
        stop: (reason: string) => this.mover.stop(reason, false),
      },
      movementInfo: () => this.sync.movementInfo(),
      serverPose: (pose) => this.sync.setFlightPose(pose),
      poseMapId: () => this.sync.mapId,
      landedWithBlocker: (blockers) => this.sync.restoreFlightBlocker(blockers),
    });
    this.sync.setFlight(this.flight);
    this.air = new AirMoves({
      send: deps.send,
      selfGuid: deps.selfGuid,
      host: this.sync,
      enter: (reason) => {
        this.mover.stop(reason, true);
        if (this.mover.airborne) this.mover.abort(reason);
      },
    });
  }

  onEvent(listener: (event: ControlEvent) => void): Unsubscribe {
    return this.events.subscribe(listener);
  }

  onStop(listener: (reason: string) => void): Unsubscribe {
    return this.stops.subscribe(listener);
  }

  snapshot(): ControlState {
    const { sync, mover } = this;
    const block = sync.blockReason();
    const pose = sync.pose();
    return {
      selfGuid: this.deps.selfGuid(),
      pose: pose && { ...pose },
      serverPose: sync.server && { ...sync.server },
      target: sync.target,
      requestedTarget: this.requestedTarget,
      moving: mover.moving,
      input: mover.input,
      airborne: mover.airborne,
      movementAllowed: block === undefined,
      blockedReason: block ?? mover.blockedReason,
      speed: mover.currentSpeed() ?? 0,
      mover: sync.mover,
    };
  }

  loginVerified(position: Position): void {
    this.sync.loginVerified(position);
  }

  currentMapId(): number {
    return this.sync.mapId;
  }

  observeSelf(input: SelfObservation): void {
    this.sync.observeSelf(input);
  }

  observeSelfSpline(move: MonsterMove): void {
    this.sync.observeSelfSpline(move);
  }

  vehicleSeat(seat: RideSeat): void {
    this.sync.vehicleSeat(seat);
  }

  vehicleLeft(): void {
    this.sync.vehicleLeft();
  }

  moverState(state: MoverState): void {
    this.sync.moverState(state);
  }

  moverPacket(
    opcode: number,
    build: (guid: bigint, info: MovementInfo) => Uint8Array,
  ): void {
    this.deps.send(
      opcode,
      build(this.sync.moverGuid(), this.sync.movementInfo()),
    );
  }

  observeTarget(target: bigint): void {
    this.sync.observeTarget(target);
  }

  teleportAck(ack: MoveAck): void {
    this.sync.teleportAck(ack);
  }

  nearTeleport(dest: MovementInfo): void {
    this.sync.nearTeleport(dest);
  }

  handleTransferPending(): void {
    this.sync.handleTransferPending();
  }

  transferAborted(abort: TransferAbortedInput): void {
    this.sync.transferAborted(abort);
  }

  newWorld(position: Position): void {
    this.sync.newWorld(position);
  }

  forceRoot(counter: number): void {
    this.sync.forceRoot(counter);
  }

  forceUnroot(counter: number): void {
    this.sync.forceUnroot(counter);
  }

  knockBack(knock: KnockBack): void {
    this.sync.knockBack(knock);
  }

  clientControl(control: ClientControl): void {
    this.sync.clientControl(control);
  }

  forceSpeed(spec: SpeedAck, force: ForceSpeed): void {
    this.sync.forceSpeed(spec, force);
  }

  setCanFly(counter: number, enable: boolean): void {
    this.sync.setCanFly(counter, enable);
  }

  moveFlag(flag: MoveFlag, enable: boolean, counter: number): void {
    this.sync.moveFlag(flag, enable, counter);
  }

  collisionHeight(counter: number, height: number): void {
    this.sync.collisionHeight(counter, height);
  }

  timeSkipped(ms: number): void {
    this.sync.timeSkipped(ms);
  }

  setSwimming(on: boolean): void {
    this.air.setSwimming(on);
  }

  setFlying(on: boolean): void {
    this.air.setFlying(on);
  }

  pitch(kind: PitchKind): void {
    this.air.pitch(kind);
  }

  ascend(kind: AscendKind): void {
    this.air.ascend(kind);
  }

  descend(): void {
    this.air.descend();
  }

  resetFall(): void {
    this.sync.resetFall();
  }

  follow(guide: MovementGuide, facing: number, durationMs: number): void {
    this.mover.guard(FORWARD);
    this.mover.face(facing);
    this.mover.change(FORWARD, durationMs, guide);
  }

  walkActive(): boolean {
    return this.mover.guiding() instanceof DirectedWalk;
  }

  walkToward(
    target: NavPoint,
    yards: number,
    signal?: AbortSignal,
  ): Promise<WalkOutcome> {
    this.assertWalkable(target, yards);
    this.mover.guard(FORWARD);
    if (signal?.aborted)
      return Promise.resolve({
        status: "stopped",
        traveled: 0,
        pose: this.sync.requirePose(),
        reason: "abort",
      });

    this.mover.stop("walk_replaced", true);
    const pose = this.sync.requirePose();
    const separation = distance2d(pose, target);
    const distance = Math.min(yards, separation);
    if (distance === 0)
      return Promise.resolve({ status: "completed", traveled: 0, pose });

    this.mover.face(bearing(pose, target));
    const plan = {
      x: pose.x,
      y: pose.y,
      dx: (target.x - pose.x) / separation,
      dy: (target.y - pose.y) / separation,
      distance,
      now: this.deps.now(),
      signal,
    };
    const walk = new DirectedWalk({ mover: this.mover, sync: this.sync, plan });
    this.mover.change(FORWARD, MAX_DURATION_MS, walk);
    return walk.outcome;
  }

  move(direction: MovementDirection, durationMs: number): void {
    this.drive(inputOf(direction), durationMs);
  }

  drive(input: MovementInput, durationMs: number): void {
    assertInput(input);
    this.assertDuration(durationMs);
    const { mover } = this;
    if (mover.guiding()) mover.stop("manual_move", true);
    if (isIdle(input)) {
      mover.stop("released", true);
      return;
    }
    mover.guard(input);
    if (mover.moving && sameInput(mover.input, input)) {
      mover.lease(durationMs);
      return;
    }
    mover.refuseBlockedStart(input);
    mover.change(input, durationMs);
  }

  jump(): void {
    if (this.mover.guiding()) this.mover.stop("manual_move", true);
    this.mover.jump();
  }

  face(orientation: number): void {
    if (!Number.isFinite(orientation)) throw new Error("invalid_orientation");
    const reason = this.sync.blockReason();
    if (reason) throw new Error(reason);
    if (this.walkActive()) this.mover.stop("face", true);
    this.mover.face(orientation);
  }

  selectTarget(guid: bigint): void {
    if (guid < 0n) throw new Error("invalid_guid");
    this.requestedTarget = guid;
    this.deps.send(GameOpcode.CMSG_SET_SELECTION, buildSetSelection(guid));
    this.emit("target_requested");
  }

  halt(reason = "halt"): void {
    this.mover.stop(reason, true);
    this.air.stopActiveInputs();
  }

  dispose(): void {
    this.events.clear();
    this.flight.dispose();
    this.sync.dispose();
    this.mover.abort("close");
    this.stops.clear();
  }

  private emit(type: ControlEventType, reason?: string): void {
    const event: ControlEvent = { type, state: this.snapshot() };
    if (reason !== undefined) event.reason = reason;
    this.events.emit(event);
  }

  private assertWalkable(target: NavPoint, yards: number): void {
    if (
      !(
        Number.isFinite(target.x) &&
        Number.isFinite(target.y) &&
        Number.isFinite(target.z)
      )
    )
      throw new Error("invalid_destination");
    if (!Number.isFinite(yards) || yards <= 0 || yards > 20)
      throw new Error("invalid_distance");
    const speed = this.sync.speedFor(FORWARD);
    if (speed === undefined || !Number.isFinite(speed) || speed <= 0)
      throw new Error("missing_speed");
  }

  private assertDuration(durationMs: number): void {
    if (
      !Number.isFinite(durationMs) ||
      durationMs < MIN_DURATION_MS ||
      durationMs > MAX_DURATION_MS
    ) {
      throw new Error("invalid_duration");
    }
  }
}
