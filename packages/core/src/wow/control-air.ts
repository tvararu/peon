import type { ControlPose } from "#wow/control";
import type { GroundOracle } from "#wow/control-motion";
import { distance2d, normalizeAngle } from "#wow/geometry";
import {
  CELL_HEIGHT,
  collisionFree,
  type NavPoint,
  WALKABLE_SLOPE,
} from "#wow/ground-step";
import type { FallData } from "#wow/protocol/movement";

export const JUMP_VELOCITY = 7.955_547;
export const GRAVITY = 19.291_105;
export const JUMP_AIRTIME_MS = ((2 * JUMP_VELOCITY) / GRAVITY) * 1000;
export const AIR_TICK_MS = 50;

const APEX_MS = (JUMP_VELOCITY / GRAVITY) * 1000;
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

function heightAt(air: Air, at: number): number {
  const t = (at - air.startedAt) / 1000;
  return air.startZ + JUMP_VELOCITY * t - (GRAVITY * t * t) / 2;
}

function touchdown(air: Air, groundZ: number): number {
  const drop = air.startZ - groundZ;
  const root = Math.sqrt(Math.max(0, JUMP_VELOCITY ** 2 + 2 * GRAVITY * drop));
  return air.startedAt + ((JUMP_VELOCITY + root) / GRAVITY) * 1000;
}

function sampleGround(
  ground: GroundOracle,
  pose: ControlPose,
  to: NavPoint,
): number | undefined {
  const z = ground.height(pose.mapId, to.x, to.y, pose);
  if (z === undefined || !Number.isFinite(z)) return undefined;
  return z;
}

function glide(
  ground: GroundOracle | undefined,
  pose: ControlPose,
  air: Air,
  to: NavPoint,
): void {
  const z = ground ? sampleGround(ground, pose, to) : air.groundZ;
  const ray = (a: NavPoint, b: NavPoint) =>
    ground ? ground.pathClear(pose.mapId, a, b) : true;
  const climb = CELL_HEIGHT + distance2d(pose, to) * WALKABLE_SLOPE;
  const blocked =
    (z !== undefined && z - to.z > climb) || !collisionFree(ray, pose, to);
  if (blocked) {
    air.xySpeed = 0;
    return;
  }
  pose.x = to.x;
  pose.y = to.y;
  if (z !== undefined) air.groundZ = z;
}

export function advanceAir(
  ground: GroundOracle | undefined,
  pose: ControlPose,
  air: Air,
  { from, to, turnRate }: AirSpan,
): number | undefined {
  const span = to - from;
  const yards = (air.xySpeed * span) / 1000;
  const steps = Math.max(
    1,
    Math.ceil(yards / AIR_STEP_YARDS),
    Math.ceil(span / AIR_TICK_MS),
  );
  let landedAt: number | undefined;
  for (let i = 1; i <= steps && landedAt === undefined; i++) {
    const start = from + ((i - 1) * span) / steps;
    let end = from + (i * span) / steps;
    const z = heightAt(air, end);
    const x = pose.x;
    const y = pose.y;
    const dt = (end - start) / 1000;
    if (air.xySpeed > 0) {
      const reach = air.xySpeed * dt;
      const next = {
        x: x + Math.cos(air.heading) * reach,
        y: y + Math.sin(air.heading) * reach,
        z,
      };
      glide(ground, pose, air, next);
    }
    if (end - air.startedAt > APEX_MS && z <= air.groundZ) {
      landedAt = Math.min(end, Math.max(start, touchdown(air, air.groundZ)));
      const share = (landedAt - start) / (end - start || 1);
      pose.x = x + (pose.x - x) * share;
      pose.y = y + (pose.y - y) * share;
      end = landedAt;
    }
    pose.z = landedAt === undefined ? z : air.groundZ;
    pose.orientation = normalizeAngle(
      pose.orientation + (turnRate * (end - start)) / 1000,
    );
  }
  pose.source = "predicted";
  pose.updatedAt = landedAt ?? to;
  return landedAt;
}
