import type { ControlDeps, ControlPose, MovementDirection } from "#wow/control";
import {
  DIR_FLAG,
  type GroundOracle,
  groundStep,
  MOVING_BITS,
} from "#wow/control-motion";
import type { Emit, MovementSync } from "#wow/control-sync";
import { normalizeAngle } from "#wow/geometry";
import { buildMoveMessage } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";

export const HEARTBEAT_MS = 500;
const STEP_MS = 100;
export const STEP_YARDS = 0.5;
const HALT_BLOCKERS = new Set(["obstructed", "height_unresolved", "too_steep"]);

const DIR_START: Record<MovementDirection, number> = {
  forward: GameOpcode.MSG_MOVE_START_FORWARD,
  backward: GameOpcode.MSG_MOVE_START_BACKWARD,
  left: GameOpcode.MSG_MOVE_START_STRAFE_LEFT,
  right: GameOpcode.MSG_MOVE_START_STRAFE_RIGHT,
};

const DIR_HEADING: Record<MovementDirection, number> = {
  forward: 0,
  backward: Math.PI,
  left: Math.PI / 2,
  right: -Math.PI / 2,
};

export type GuideStep = { halt: string } | { fail: string } | undefined;

export type Guide = {
  readonly heartbeatMs: number;
  advance: (pose: ControlPose, yards: number, now: number) => GuideStep;
  leaseMs: (now: number) => number;
  end: (reason: string) => void;
};

export type StepTarget = {
  x: number;
  y: number;
  now: number;
  directed: boolean;
};

export type MoverParts = {
  deps: ControlDeps;
  sync: MovementSync;
  emit: Emit;
  interrupt: (reason: string) => void;
};

export class Mover {
  moving = false;
  direction: MovementDirection | undefined;
  owner: "manual" | "none" = "none";
  blockedReason: string | undefined;
  private readonly deps: ControlDeps;
  private readonly ground: GroundOracle | undefined;
  private readonly sync: MovementSync;
  private readonly emit: Emit;
  private readonly interrupt: (reason: string) => void;
  private guide: Guide | undefined;
  private leaseTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private lastIntegrate = 0;
  private lastHeartbeat = 0;

  constructor({ deps, sync, emit, interrupt }: MoverParts) {
    this.deps = deps;
    this.ground = deps.ground;
    this.sync = sync;
    this.emit = emit;
    this.interrupt = interrupt;
  }

  guiding(): Guide | undefined {
    return this.guide;
  }

  currentSpeed(): number | undefined {
    return this.direction
      ? this.sync.speedFor(this.direction)
      : this.sync.runSpeed;
  }

  guard(direction: MovementDirection): void {
    const reason = this.sync.blockReason();
    if (reason) throw new Error(reason);
    this.sync.requirePose();
    if (this.sync.speedFor(direction) === undefined)
      throw new Error("missing_speed");
  }

  face(orientation: number): void {
    this.integrate();
    const pose = this.sync.requirePose();
    pose.orientation = normalizeAngle(orientation);
    pose.source = "predicted";
    pose.updatedAt = this.deps.now();
    this.sync.predicted = pose;
    this.sendMove(GameOpcode.MSG_MOVE_SET_FACING);
    this.emit("facing_changed");
  }

  start(direction: MovementDirection, durationMs: number, guide?: Guide): void {
    const pose = this.sync.requirePose();
    this.sync.predicted = {
      ...pose,
      source: "predicted",
      updatedAt: this.deps.now(),
    };
    this.guide = guide;
    this.direction = direction;
    this.moving = true;
    this.owner = "manual";
    this.blockedReason = undefined;
    this.sync.moveFlags = DIR_FLAG[direction];
    this.lastIntegrate = this.deps.now();
    this.lastHeartbeat = this.deps.ticks();
    this.sendMove(DIR_START[direction]);
    this.lease(durationMs);
    this.heartbeatTimer = setInterval(
      () => this.heartbeat(),
      guide ? STEP_MS : HEARTBEAT_MS,
    );
    this.emit("movement_started");
    this.emit("control_changed");
  }

  lease(durationMs: number): void {
    if (this.leaseTimer !== undefined) clearTimeout(this.leaseTimer);
    this.leaseTimer = setTimeout(() => {
      const guide = this.guide;
      if (!guide) {
        this.stop("lease", true);
        return;
      }
      this.heartbeat();
      if (this.guide !== guide || !this.moving) return;
      const remaining = guide.leaseMs(this.deps.now());
      if (remaining <= 0) this.stop("lease", true);
      else this.lease(remaining);
    }, durationMs);
  }

  stop(reason: string, sendStop: boolean): void {
    this.integrate();
    this.halt(reason, sendStop);
    this.interrupt(reason);
  }

  abort(reason: string): void {
    this.interrupt(reason);
    this.end(reason, reason, false);
  }

  refuseBlockedStart(direction: MovementDirection): void {
    const pose = this.sync.requirePose();
    const heading = pose.orientation + DIR_HEADING[direction];
    const to = {
      x: pose.x + Math.cos(heading) * STEP_YARDS,
      y: pose.y + Math.sin(heading) * STEP_YARDS,
    };
    const step = groundStep(this.ground, pose, to, false);
    if (step.ok) return;
    this.blockedReason = step.reason;
    this.emit("control_changed", step.reason);
    throw new Error(step.reason);
  }

  step(pose: ControlPose, next: StepTarget): GuideStep {
    const step = groundStep(this.ground, pose, next, next.directed);
    if (!step.ok)
      return step.reason === "ground_height_unavailable"
        ? { fail: step.reason }
        : { halt: step.reason };
    const { x, y, now } = next;
    Object.assign(pose, { x, y, z: step.z, source: "predicted" });
    pose.updatedAt = now;
    return undefined;
  }

  integrate(): void {
    const predicted = this.sync.predicted;
    if (!(this.moving && predicted && this.direction)) return;
    const now = this.deps.now();
    const dt = (now - this.lastIntegrate) / 1000;
    this.lastIntegrate = now;
    if (dt <= 0) return;
    const speed = this.currentSpeed();
    if (speed === undefined) return;
    const heading = predicted.orientation + DIR_HEADING[this.direction];
    const result = this.guide
      ? this.guide.advance(predicted, speed * dt, now)
      : this.advanceFree(predicted, heading, speed * dt, now);
    if (result && "fail" in result) this.fail(result.fail);
    else if (result) this.halt(result.halt, true);
  }

  private advanceFree(
    pose: ControlPose,
    heading: number,
    advance: number,
    now: number,
  ): GuideStep {
    const { x, y } = pose;
    for (let moved = 0; moved < advance; ) {
      moved = Math.min(advance, moved + STEP_YARDS);
      const next = {
        x: x + Math.cos(heading) * moved,
        y: y + Math.sin(heading) * moved,
        now,
        directed: false,
      };
      const result = this.step(pose, next);
      if (result) return result;
    }
    return undefined;
  }

  private heartbeat(): void {
    this.integrate();
    if (!this.moving) return;
    const now = this.deps.ticks();
    const interval = this.guide?.heartbeatMs ?? HEARTBEAT_MS;
    if (now - this.lastHeartbeat < interval) return;
    this.lastHeartbeat = now;
    this.sendMove(GameOpcode.MSG_MOVE_HEARTBEAT);
  }

  private halt(reason: string, sendStop: boolean): void {
    const blocked = HALT_BLOCKERS.has(reason) ? reason : undefined;
    if (!this.moving && this.owner === "none") {
      if (!blocked) this.blockedReason = undefined;
      return;
    }
    this.end(reason, blocked, sendStop);
  }

  private fail(reason: string): void {
    this.abort(reason);
    this.sendMove(GameOpcode.MSG_MOVE_STOP);
    this.emit("control_error", reason);
  }

  private end(
    reason: string,
    blocked: string | undefined,
    sendStop: boolean,
  ): void {
    this.clearTimers();
    const guide = this.guide;
    this.guide = undefined;
    const wasMoving = this.moving;
    const ownerChanged = this.owner !== "none";
    this.moving = false;
    this.direction = undefined;
    this.owner = "none";
    this.blockedReason = blocked;
    this.sync.moveFlags &= ~MOVING_BITS;
    guide?.end(reason);
    if (sendStop && wasMoving) this.sendMove(GameOpcode.MSG_MOVE_STOP);
    if (wasMoving) this.emit("movement_stopped", reason);
    if (ownerChanged) this.emit("control_changed", reason);
  }

  private sendMove(opcode: number): void {
    const info = this.sync.movementInfo();
    this.deps.send(opcode, buildMoveMessage(this.deps.selfGuid(), info));
  }

  private clearTimers(): void {
    if (this.leaseTimer !== undefined) clearTimeout(this.leaseTimer);
    if (this.heartbeatTimer !== undefined) clearInterval(this.heartbeatTimer);
    this.leaseTimer = undefined;
    this.heartbeatTimer = undefined;
  }
}
