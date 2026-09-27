import type { ControlPose } from "#wow/control";
import { type GroundOracle, groundStep } from "#wow/control-motion";
import { normalizeAngle } from "#wow/geometry";
import type { FallData } from "#wow/protocol/movement";

export const JUMP_VELOCITY = 7.955_547;
export const GRAVITY = 19.291_105;
export const JUMP_AIRTIME_MS = ((2 * JUMP_VELOCITY) / GRAVITY) * 1000;

const AIR_STEP_YARDS = 0.5;

export type Air = {
  startedAt: number;
  startTicks: number;
  startZ: number;
  groundZ: number;
  heading: number;
  xySpeed: number;
};

export type AirSpan = { from: number; to: number; turnRate: number };

export function jumpFall({ heading, xySpeed }: Air): FallData {
  return {
    zSpeed: -JUMP_VELOCITY,
    cosAngle: Math.cos(heading),
    sinAngle: Math.sin(heading),
    xySpeed,
  };
}

export function advanceAir(
  ground: GroundOracle | undefined,
  pose: ControlPose,
  air: Air,
  { from, to, turnRate }: AirSpan,
): void {
  const dt = (to - from) / 1000;
  pose.orientation = normalizeAngle(pose.orientation + turnRate * dt);
  const advance = air.xySpeed * dt;
  const steps = Math.ceil(advance / AIR_STEP_YARDS);
  for (let i = 0; i < steps; i++) {
    const next = {
      x: pose.x + (Math.cos(air.heading) * advance) / steps,
      y: pose.y + (Math.sin(air.heading) * advance) / steps,
    };
    const step = groundStep(ground, { ...pose, z: air.groundZ }, next, false);
    if (!step.ok) {
      air.xySpeed = 0;
      break;
    }
    Object.assign(pose, next);
    air.groundZ = step.z;
  }
  const t = (to - air.startedAt) / 1000;
  const rise = JUMP_VELOCITY * t - (GRAVITY * t * t) / 2;
  pose.z = Math.max(air.groundZ, air.startZ + rise);
  pose.source = "predicted";
  pose.updatedAt = to;
}
