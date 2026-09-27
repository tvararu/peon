import { Emitter, type Unsubscribe } from "#lib/emitter";
import {
  DIR_FLAG,
  type GroundOracle,
  MAX_DURATION_MS,
} from "#wow/control-motion";
import { Mover } from "#wow/control-mover";
import { RouteFollower, type RouteRefusal } from "#wow/control-route";
import { MovementSync, type SelfObservation } from "#wow/control-sync";
import { DirectedWalk } from "#wow/control-walk";
import type { Position } from "#wow/entity-store";
import { bearing, distance2d } from "#wow/geometry";
import type {
  GroundRoute,
  NavDestination,
  NavigationRefusal,
  NavPoint,
} from "#wow/navigation";
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
import type { Replanner, ReplanState } from "#wow/route-session";

export type MovementDirection = "forward" | "backward" | "left" | "right";

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

export type ControlMode = "none" | "jev";
export type ControlOwner = ControlMode | "manual";

export type ControlState = {
  selfGuid: bigint;
  pose: ControlPose | undefined;
  serverPose: ControlPose | undefined;
  target: bigint | undefined;
  requestedTarget: bigint | undefined;
  moving: boolean;
  direction: MovementDirection | undefined;
  movementAllowed: boolean;
  blockedReason: string | undefined;
  speed: number;
  owner: ControlOwner;
};

export type NavigationState = {
  active: boolean;
  destination: NavDestination | undefined;
  remaining: number | undefined;
  owner: ControlOwner;
  blockedReason: string | undefined;
  refusal: NavigationRefusal | undefined;
  target?: bigint;
  replan?: ReplanState;
  floors?: number[];
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
  | "area_explored";

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
  private readonly routes: RouteFollower;
  private mode: ControlMode = "none";
  private requestedTarget: bigint | undefined;

  constructor(deps: ControlDeps) {
    const emit = (type: ControlEventType, reason?: string): void =>
      this.emit(type, reason);
    const motion = {
      moving: () => this.mover.moving,
      settle: () => this.mover.integrate(),
      abort: (reason: string) => this.mover.abort(reason),
      stop: (reason: string) => this.mover.stop(reason, false),
    };
    const interrupt = (reason: string): void =>
      this.routes.cancelReplan(reason);
    const mode = (): ControlMode => this.mode;
    this.deps = deps;
    this.sync = new MovementSync({ deps, emit, motion });
    this.mover = new Mover({ deps, sync: this.sync, emit, interrupt });
    const parts = { deps, sync: this.sync, mover: this.mover, emit, mode };
    this.routes = new RouteFollower(parts);
  }

  onEvent(listener: (event: ControlEvent) => void): Unsubscribe {
    return this.events.subscribe(listener);
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
      direction: mover.direction,
      movementAllowed: block === undefined,
      blockedReason: block ?? mover.blockedReason,
      speed: mover.currentSpeed() ?? 0,
      owner: this.mode === "none" ? mover.owner : this.mode,
    };
  }

  loginVerified(position: Position): void {
    this.sync.loginVerified(position);
  }

  waitLogin(timeoutMs?: number): Promise<void> {
    return this.sync.waitLogin(timeoutMs);
  }

  currentMapId(): number {
    return this.sync.mapId;
  }

  observeSelf(input: SelfObservation): void {
    this.sync.observeSelf(input);
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

  setMode(mode: ControlMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.mover.stop("mode_changed", true);
    this.emit("control_changed", "mode_changed");
  }

  serverFixAge(): number | undefined {
    const server = this.sync.server;
    return server && this.deps.now() - server.updatedAt;
  }

  navigationState(): NavigationState {
    return this.routes.state();
  }

  navigationError(
    destination: NavDestination | undefined,
    reason: string,
    detail?: RouteRefusal,
  ): void {
    this.routes.refuse(destination, reason, detail);
  }

  navigate(
    route: GroundRoute,
    destination: NavPoint,
    replan?: Replanner,
    target?: bigint,
  ): void {
    this.routes.navigate(route, destination, replan, target);
  }

  observeDisappear(guid: bigint): void {
    this.routes.observeDisappear(guid);
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
    this.mover.guard("forward");
    if (signal?.aborted)
      return Promise.resolve({
        status: "stopped",
        traveled: 0,
        pose: this.sync.requirePose(),
        reason: "abort",
      });

    this.setMode("none");
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
    this.mover.start("forward", MAX_DURATION_MS, walk);
    return walk.outcome;
  }

  move(direction: MovementDirection, durationMs: number): void {
    this.assertDirection(direction);
    this.assertDuration(durationMs);
    const { mover } = this;
    if (mover.guiding()) mover.stop("manual_move", true);
    if (mover.moving && mover.direction === direction) {
      mover.guard(direction);
      mover.lease(durationMs);
      return;
    }
    mover.guard(direction);
    mover.refuseBlockedStart(direction);
    if (mover.moving) mover.stop("direction_change", true);
    mover.start(direction, durationMs);
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
  }

  dispose(): void {
    this.events.clear();
    this.mode = "none";
    this.mover.abort("close");
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
    const speed = this.sync.speedFor("forward");
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

  private assertDirection(direction: MovementDirection): void {
    if (!(direction in DIR_FLAG)) throw new Error("invalid_direction");
  }
}
