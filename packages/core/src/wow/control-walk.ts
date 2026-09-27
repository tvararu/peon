import type { ControlPose, WalkOutcome } from "#wow/control";
import { MAX_DURATION_MS } from "#wow/control-motion";
import {
  type Guide,
  type GuideStep,
  HEARTBEAT_MS,
  type Mover,
  STEP_YARDS,
} from "#wow/control-mover";
import type { MovementSync } from "#wow/control-sync";

export type WalkPlan = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  distance: number;
  now: number;
  signal?: AbortSignal;
};

export type WalkParts = { mover: Mover; sync: MovementSync; plan: WalkPlan };

export class DirectedWalk implements Guide {
  readonly heartbeatMs = HEARTBEAT_MS;
  readonly outcome: Promise<WalkOutcome>;
  private readonly mover: Mover;
  private readonly sync: MovementSync;
  private readonly plan: WalkPlan;
  private readonly resolve: (outcome: WalkOutcome) => void;
  private traveled = 0;
  private lastProgressAt: number;

  constructor({ mover, sync, plan }: WalkParts) {
    const { promise, resolve } = Promise.withResolvers<WalkOutcome>();
    this.outcome = promise;
    this.resolve = resolve;
    this.mover = mover;
    this.sync = sync;
    this.plan = plan;
    this.lastProgressAt = plan.now;
    plan.signal?.addEventListener("abort", this.abort, { once: true });
  }

  advance(pose: ControlPose, yards: number, now: number): GuideStep {
    const { x, y, dx, dy, distance } = this.plan;
    const reach = Math.min(distance, this.traveled + yards);
    while (this.traveled < reach) {
      const next = Math.min(reach, this.traveled + STEP_YARDS);
      const to = { x: x + dx * next, y: y + dy * next, now, directed: true };
      const result = this.mover.step(pose, to);
      if (result) return result;
      this.traveled = next;
      this.lastProgressAt = now;
    }
    return this.traveled >= distance ? { halt: "arrived" } : undefined;
  }

  leaseMs(now: number): number {
    return MAX_DURATION_MS - (now - this.lastProgressAt);
  }

  end(reason: string): void {
    this.plan.signal?.removeEventListener("abort", this.abort);
    const outcome: WalkOutcome = {
      status: reason === "arrived" ? "completed" : "stopped",
      traveled: this.traveled,
      pose: this.sync.requirePose(),
    };
    if (reason !== "arrived") outcome.reason = reason;
    this.resolve(outcome);
  }

  private readonly abort = (): void => {
    if (this.mover.guiding() === this) this.mover.stop("abort", true);
  };
}
