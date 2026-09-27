import type { ControlDeps, ControlPose } from "#wow/control";
import {
  type Air,
  advanceAir,
  JUMP_AIRTIME_MS,
  jumpFall,
} from "#wow/control-air";
import {
  INPUT_BITS,
  inputFlags,
  inputSteps,
  type MovementInput,
  translationHeading,
  turnSign,
} from "#wow/control-input";
import { type GroundOracle, groundStep } from "#wow/control-motion";
import type { Emit, MovementSync } from "#wow/control-sync";
import { normalizeAngle } from "#wow/geometry";
import { MovementFlag } from "#wow/protocol/entity-fields";
import { buildMoveMessage } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";

export const HEARTBEAT_MS = 500;
const STEP_MS = 100;
export const STEP_YARDS = 0.5;
const TURN_STEP = 0.05;
const HALT_BLOCKERS = new Set(["obstructed", "height_unresolved", "too_steep"]);
const IDLE: MovementInput = {};

export type GuideStep = { halt: string } | { fail: string } | undefined;

export type MovementGuide = {
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
  input: MovementInput = IDLE;
  blockedReason: string | undefined;
  private readonly deps: ControlDeps;
  private readonly ground: GroundOracle | undefined;
  private readonly sync: MovementSync;
  private readonly emit: Emit;
  private readonly interrupt: (reason: string) => void;
  private guide: MovementGuide | undefined;
  private air: Air | undefined;
  private leaseTimer: ReturnType<typeof setTimeout> | undefined;
  private landTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private tickMs = 0;
  private lastIntegrate = 0;
  private lastHeartbeat = 0;

  constructor({ deps, sync, emit, interrupt }: MoverParts) {
    this.deps = deps;
    this.ground = deps.ground;
    this.sync = sync;
    this.emit = emit;
    this.interrupt = interrupt;
  }

  get airborne(): boolean {
    return this.air !== undefined;
  }

  guiding(): MovementGuide | undefined {
    return this.guide;
  }

  currentSpeed(): number | undefined {
    return this.moving ? this.sync.speedFor(this.input) : this.sync.runSpeed;
  }

  guard(input: MovementInput): void {
    const reason = this.sync.blockReason();
    if (reason) throw new Error(reason);
    this.sync.requirePose();
    const translating = translationHeading(input) !== undefined;
    if (translating && this.sync.speedFor(input) === undefined)
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

  change(
    input: MovementInput,
    durationMs: number,
    guide?: MovementGuide,
  ): void {
    this.integrate();
    this.activate();
    const wasMoving = this.moving;
    this.guide = guide;
    this.applySteps(input);
    this.moving = true;
    this.blockedReason = undefined;
    this.lease(durationMs);
    this.tick(guide ? STEP_MS : HEARTBEAT_MS);
    if (!wasMoving) this.emit("movement_started");
    this.emit("control_changed");
  }

  jump(): void {
    const reason = this.sync.blockReason();
    if (reason) throw new Error(reason);
    if (this.air) throw new Error("airborne");
    this.integrate();
    this.activate();
    const pose = this.sync.requirePose();
    const offset = this.moving ? translationHeading(this.input) : undefined;
    const speed = offset === undefined ? 0 : this.currentSpeed();
    const air: Air = {
      startedAt: this.deps.now(),
      startTicks: this.deps.ticks(),
      startZ: pose.z,
      groundZ: pose.z,
      heading: normalizeAngle(pose.orientation + (offset ?? 0)),
      xySpeed: speed ?? 0,
    };
    this.air = air;
    this.sync.moveFlags |= MovementFlag.FALLING;
    this.sync.fall = jumpFall(air);
    this.sendMove(GameOpcode.MSG_MOVE_JUMP);
    this.armLanding(JUMP_AIRTIME_MS);
    this.tick(this.guide ? STEP_MS : HEARTBEAT_MS);
    this.emit("control_changed", "jumped");
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
    this.dropAir();
    this.end(reason, reason, false);
  }

  refuseBlockedStart(input: MovementInput): void {
    const offset = translationHeading(input);
    if (offset === undefined) return;
    if (this.moving && translationHeading(this.input) === offset) return;
    const pose = this.sync.requirePose();
    const heading = pose.orientation + offset;
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
    if (!((this.moving || this.air) && predicted)) return;
    const now = this.deps.now();
    let from = this.lastIntegrate;
    this.lastIntegrate = now;
    if (now <= from) return;
    const air = this.air;
    if (air) {
      const landAt = air.startedAt + JUMP_AIRTIME_MS;
      const to = Math.min(now, landAt);
      const turnRate = this.turnRate();
      advanceAir(this.ground, predicted, air, { from, to, turnRate });
      if (now < landAt) return;
      this.land(predicted, air);
      from = landAt;
    }
    if (this.moving && now > from) this.advanceGround(predicted, from, now);
  }

  private advanceGround(pose: ControlPose, from: number, now: number): void {
    const dt = (now - from) / 1000;
    const speed = this.currentSpeed() ?? 0;
    const result = this.guide
      ? this.guide.advance(pose, speed * dt, now)
      : this.advanceFree(pose, speed * dt, this.turnRate() * dt, now);
    if (result && "fail" in result) this.fail(result.fail);
    else if (result) this.halt(result.halt, true);
  }

  private advanceFree(
    pose: ControlPose,
    advance: number,
    turn: number,
    now: number,
  ): GuideStep {
    const offset = translationHeading(this.input);
    const yards = offset === undefined ? 0 : advance;
    const steps = Math.max(
      1,
      Math.ceil(yards / STEP_YARDS),
      Math.ceil(Math.abs(turn) / TURN_STEP),
    );
    for (let i = 0; i < steps; i++) {
      const facing = pose.orientation + turn / steps;
      if (offset !== undefined) {
        const heading = (pose.orientation + facing) / 2 + offset;
        const next = {
          x: pose.x + (Math.cos(heading) * yards) / steps,
          y: pose.y + (Math.sin(heading) * yards) / steps,
          now,
          directed: false,
        };
        const result = this.step(pose, next);
        if (result) return result;
      }
      pose.orientation = normalizeAngle(facing);
      pose.source = "predicted";
      pose.updatedAt = now;
    }
    return undefined;
  }

  private turnRate(): number {
    return this.moving ? turnSign(this.input) * this.sync.turnRate : 0;
  }

  private land(pose: ControlPose, air: Air): void {
    pose.z = air.groundZ;
    this.sync.moveFlags &= ~MovementFlag.FALLING;
    this.sync.fallTime = Math.round(JUMP_AIRTIME_MS);
    this.sendMove(GameOpcode.MSG_MOVE_FALL_LAND);
    this.dropAir();
    if (!this.moving) this.clearTicker();
    this.emit("control_changed", "landed");
  }

  private heartbeat(): void {
    this.integrate();
    if (!(this.moving || this.air)) return;
    const now = this.deps.ticks();
    const interval = this.guide?.heartbeatMs ?? HEARTBEAT_MS;
    if (now - this.lastHeartbeat < interval) return;
    this.lastHeartbeat = now;
    this.sendMove(GameOpcode.MSG_MOVE_HEARTBEAT);
  }

  private halt(reason: string, sendStop: boolean): void {
    const blocked = HALT_BLOCKERS.has(reason) ? reason : undefined;
    if (!this.moving) {
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
    if (this.leaseTimer !== undefined) clearTimeout(this.leaseTimer);
    this.leaseTimer = undefined;
    if (!this.air) this.clearTicker();
    const guide = this.guide;
    this.guide = undefined;
    const wasMoving = this.moving;
    this.moving = false;
    this.blockedReason = blocked;
    if (sendStop && wasMoving) this.applySteps(IDLE);
    this.input = IDLE;
    this.sync.moveFlags &= ~INPUT_BITS;
    guide?.end(reason);
    if (wasMoving) this.emit("movement_stopped", reason);
    if (wasMoving) this.emit("control_changed", reason);
  }

  private activate(): void {
    if (this.moving || this.air) return;
    const now = this.deps.now();
    this.sync.predicted = {
      ...this.sync.requirePose(),
      source: "predicted",
      updatedAt: now,
    };
    this.lastIntegrate = now;
    this.lastHeartbeat = this.deps.ticks();
  }

  private applySteps(input: MovementInput): void {
    for (const step of inputSteps(this.input, input)) {
      this.input = step.input;
      this.sync.moveFlags =
        (this.sync.moveFlags & ~INPUT_BITS) | inputFlags(step.input);
      this.sendMove(step.opcode);
    }
  }

  private armLanding(delayMs: number): void {
    this.landTimer = setTimeout(() => {
      this.landTimer = undefined;
      this.heartbeat();
      const air = this.air;
      if (!air) return;
      const left = air.startedAt + JUMP_AIRTIME_MS - this.deps.now();
      this.armLanding(Math.max(1, Math.ceil(left)));
    }, Math.ceil(delayMs));
  }

  private dropAir(): void {
    if (this.landTimer !== undefined) clearTimeout(this.landTimer);
    this.landTimer = undefined;
    if (!this.air) return;
    this.air = undefined;
    this.sync.moveFlags &= ~MovementFlag.FALLING;
    this.sync.fall = undefined;
    this.sync.fallTime = 0;
  }

  private tick(periodMs: number): void {
    if (this.heartbeatTimer !== undefined && this.tickMs === periodMs) return;
    this.clearTicker();
    this.tickMs = periodMs;
    this.heartbeatTimer = setInterval(() => this.heartbeat(), periodMs);
  }

  private clearTicker(): void {
    if (this.heartbeatTimer !== undefined) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private sendMove(opcode: number): void {
    const air = this.air;
    if (air && this.sync.moveFlags & MovementFlag.FALLING)
      this.sync.fallTime = this.deps.ticks() - air.startTicks;
    const info = this.sync.movementInfo();
    this.deps.send(opcode, buildMoveMessage(this.deps.selfGuid(), info));
  }
}
