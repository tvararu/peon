import type { GroundOracle } from "@peon/core";
import {
  jumpGate,
  PILOT_JUMP_NEAR_YD,
  PILOT_RUN_SPEED_YD,
  poseOf,
  scanHeading,
} from "#harness/loops/pilot-geometry";
import type { ControlPort } from "#harness/loops/ports";

export const JUMP_ARM_TICK_MS = 25;
const JUMP_ARM_SLACK_MS = 300;

type JumpArmDeps = {
  control: Pick<ControlPort, "snapshot" | "jump" | "settle">;
  ground: GroundOracle | undefined;
  now: () => number;
};

export class JumpArm {
  private readonly deps: JumpArmDeps;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(deps: JumpArmDeps) {
    this.deps = deps;
  }

  arm(aheadYd: number): void {
    this.disarm();
    if (this.fire()) return;
    const runMs =
      (Math.max(0, aheadYd - PILOT_JUMP_NEAR_YD) / PILOT_RUN_SPEED_YD) * 1000;
    const deadline = this.deps.now() + runMs + JUMP_ARM_SLACK_MS;
    this.timer = setInterval(() => {
      if (this.fire() || this.deps.now() > deadline) this.disarm();
    }, JUMP_ARM_TICK_MS);
  }

  disarm(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private fire(): boolean {
    this.deps.control.settle();
    const state = this.deps.control.snapshot();
    if (state.pose === undefined || state.airborne) return false;
    const pose = poseOf(state.pose, state.speed, false);
    const ahead = scanHeading(this.deps.ground, pose, pose.orientation);
    if (!jumpGate(this.deps.ground, pose, ahead)) return false;
    try {
      this.deps.control.jump();
    } catch {
      this.disarm();
    }
    return true;
  }
}
