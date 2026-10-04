import {
  CELL_HEIGHT,
  collisionFree,
  GRAVITY,
  type GroundOracle,
  groundStep,
  JUMP_VELOCITY,
  type NavPoint,
  normalizeAngle,
  type Position,
  WALKABLE_SLOPE,
} from "@peon/core";
import type { PilotObjective } from "#harness/loops/pilot-types";

export const PILOT_STEP_YD = 0.5;
export const PILOT_RANGE_YD = 10;
export const PILOT_MIN_CLEAR_YD = 2;
export const PILOT_JUMP_NEAR_YD = 1;
export const PILOT_JUMP_FAR_YD = 3;
export const PILOT_JUMP_OFFER_YD = 6;
export const PILOT_JUMP_TAKEOFF_YD = 2;
export const PILOT_JUMP_LOW_YD = 0.3;
export const PILOT_JUMP_HIGH_YD = 1.4;
export const PILOT_JUMP_TOP_MARGIN_YD = 0.1;
export const PILOT_RUN_SPEED_YD = 7;
const LOW_RAY_YD = 0.25;
const HIGH_RAY_YD = 1.6;
const PROFILE_SPAN_YD = 1;
const PROFILE_STEP_YD = 0.1;
const JUMP_SAMPLE_MS = 50;

export type PilotPose = {
  x: number;
  y: number;
  z: number;
  orientation: number;
  mapId: number;
  speed: number;
  airborne: boolean;
};

export type PilotBlocker =
  | { kind: "open" }
  | { kind: "wall" }
  | { kind: "low"; topYd: number }
  | { kind: "drop" };

export type PilotScan = {
  heading: number;
  freeYd: number;
  blocker: PilotBlocker;
};

export function poseOf(
  position: Position,
  speed: number,
  airborne: boolean,
): PilotPose {
  return {
    airborne,
    mapId: position.mapId,
    orientation: normalizeAngle(position.orientation),
    speed,
    x: position.x,
    y: position.y,
    z: position.z,
  };
}

export function marchOrigin(pose: PilotPose): Position {
  return {
    mapId: pose.mapId,
    orientation: pose.orientation,
    x: pose.x,
    y: pose.y,
    z: pose.z,
  };
}

export function scanHeading(
  ground: GroundOracle | undefined,
  pose: PilotPose,
  heading: number,
): PilotScan {
  const norm = normalizeAngle(heading);
  if (ground === undefined)
    return { blocker: { kind: "open" }, freeYd: PILOT_RANGE_YD, heading: norm };
  let freeYd = 0;
  let at = marchOrigin(pose);
  let blocked: PilotBlocker | undefined;
  for (let d = PILOT_STEP_YD; d <= PILOT_RANGE_YD + 0.001; d += PILOT_STEP_YD) {
    const next = {
      x: pose.x + Math.cos(norm) * d,
      y: pose.y + Math.sin(norm) * d,
    };
    const step = groundStep(ground, at, next, false);
    const rayBlocked =
      step.ok &&
      !segmentFree(ground, pose.mapId, at, { x: next.x, y: next.y, z: step.z });
    if (!step.ok || rayBlocked) {
      const probe = { ...pose, x: at.x, y: at.y, z: at.z };
      blocked = classifyBlocked(ground, probe, norm);
      break;
    }
    freeYd = Math.round(d * 10) / 10;
    at = { ...at, x: next.x, y: next.y, z: step.z };
  }
  if (freeYd >= PILOT_RANGE_YD)
    return { blocker: { kind: "open" }, freeYd, heading: norm };
  return { blocker: blocked ?? { kind: "drop" }, freeYd, heading: norm };
}

function segmentFree(
  ground: GroundOracle,
  mapId: number,
  from: NavPoint,
  to: NavPoint,
): boolean {
  const ray = (a: NavPoint, b: NavPoint) => ground.pathClear(mapId, a, b);
  return collisionFree(ray, from, to);
}

function classifyBlocked(
  ground: GroundOracle,
  pose: PilotPose,
  heading: number,
): PilotBlocker {
  const top = obstacleTopYd(ground, pose, heading);
  if (top === undefined) return { kind: "drop" };
  if (top > HIGH_RAY_YD) return { kind: "wall" };
  return { kind: "low", topYd: top };
}

export function obstacleTopYd(
  ground: GroundOracle,
  pose: PilotPose,
  heading: number,
): number | undefined {
  const end = {
    x: pose.x + Math.cos(heading) * PROFILE_SPAN_YD,
    y: pose.y + Math.sin(heading) * PROFILE_SPAN_YD,
  };
  const steps = Math.round((HIGH_RAY_YD - LOW_RAY_YD) / PROFILE_STEP_YD);
  for (let i = 0; i <= steps; i++) {
    const lift = LOW_RAY_YD + i * PROFILE_STEP_YD;
    const from = { x: pose.x, y: pose.y, z: pose.z + lift };
    if (ground.pathClear(pose.mapId, from, { ...end, z: pose.z + lift }))
      return i === 0 ? undefined : Math.round(lift * 10) / 10;
  }
  return Number.POSITIVE_INFINITY;
}

export function jumpOffered(
  ground: GroundOracle | undefined,
  pose: PilotPose,
  ahead: PilotScan,
): boolean {
  if (ground === undefined || pose.airborne) return false;
  if (ahead.freeYd < PILOT_JUMP_NEAR_YD || ahead.freeYd > PILOT_JUMP_OFFER_YD)
    return false;
  const blocker = ahead.blocker;
  if (!jumpableTop(blocker)) return false;
  const takeoff = Math.min(ahead.freeYd, PILOT_JUMP_TAKEOFF_YD);
  const shift = ahead.freeYd - takeoff;
  const x = pose.x + Math.cos(ahead.heading) * shift;
  const y = pose.y + Math.sin(ahead.heading) * shift;
  const z = finiteGround(ground, pose.mapId, { x, y }, pose);
  if (z === undefined) return false;
  const at = { ...pose, x, y, z };
  return arcClears(ground, at, { ...ahead, freeYd: takeoff }, blocker.topYd);
}

export function jumpGate(
  ground: GroundOracle | undefined,
  pose: PilotPose,
  ahead: PilotScan,
): boolean {
  if (ground === undefined || pose.airborne) return false;
  if (ahead.freeYd < PILOT_JUMP_NEAR_YD || ahead.freeYd > PILOT_JUMP_FAR_YD)
    return false;
  const blocker = ahead.blocker;
  if (!jumpableTop(blocker)) return false;
  return arcClears(ground, pose, ahead, blocker.topYd);
}

function jumpableTop(
  blocker: PilotBlocker,
): blocker is Extract<PilotBlocker, { kind: "low" }> {
  return (
    blocker.kind === "low" &&
    blocker.topYd >= PILOT_JUMP_LOW_YD &&
    blocker.topYd <= PILOT_JUMP_HIGH_YD
  );
}

type ArcScan = { speed: number; startZ: number; origin: NavPoint };

type ArcTopInput = {
  ahead: PilotScan;
  pose: PilotPose;
  speed: number;
  startZ: number;
  topYd: number;
};

export function arcClears(
  ground: GroundOracle,
  pose: PilotPose,
  ahead: PilotScan,
  topYd: number,
): boolean {
  const speed = pose.speed > 0 ? pose.speed : PILOT_RUN_SPEED_YD;
  const origin = marchOrigin(pose);
  const startZ = finiteGround(ground, pose.mapId, pose, origin);
  if (startZ === undefined) return false;
  if (!arcTopClears({ ahead, pose, speed, startZ, topYd })) return false;
  return arcPathClears(ground, pose, ahead, { origin, speed, startZ });
}

function arcTopClears({
  ahead,
  pose,
  speed,
  startZ,
  topYd,
}: ArcTopInput): boolean {
  for (const edge of [ahead.freeYd, ahead.freeYd + PILOT_STEP_YD]) {
    const t = edge / speed;
    const z = pose.z + JUMP_VELOCITY * t - (GRAVITY * t * t) / 2;
    if (z - startZ < topYd + PILOT_JUMP_TOP_MARGIN_YD) return false;
  }
  return true;
}

function arcPathClears(
  ground: GroundOracle,
  pose: PilotPose,
  ahead: PilotScan,
  scan: ArcScan,
): boolean {
  const { origin, speed } = scan;
  const airtimeMs = ((2 * JUMP_VELOCITY) / GRAVITY) * 1000;
  const apexMs = (JUMP_VELOCITY / GRAVITY) * 1000;
  const heightAt = (ms: number): NavPoint => {
    const t = ms / 1000;
    return {
      x: pose.x + Math.cos(ahead.heading) * speed * t,
      y: pose.y + Math.sin(ahead.heading) * speed * t,
      z: pose.z + JUMP_VELOCITY * t - (GRAVITY * t * t) / 2,
    };
  };
  const ray = (a: NavPoint, b: NavPoint) => ground.pathClear(pose.mapId, a, b);
  let prev = heightAt(0);
  let landing: { x: number; y: number } | undefined;
  for (
    let ms = JUMP_SAMPLE_MS;
    ms < airtimeMs + JUMP_SAMPLE_MS;
    ms += JUMP_SAMPLE_MS
  ) {
    const point = heightAt(Math.min(ms, airtimeMs));
    const groundZ = finiteGround(ground, pose.mapId, point, origin);
    if (groundZ === undefined) return false;
    if (ms > apexMs && (point.z <= groundZ || ms >= airtimeMs)) {
      landing = { x: point.x, y: point.y };
      break;
    }
    const climb =
      CELL_HEIGHT +
      Math.hypot(point.x - prev.x, point.y - prev.y) * WALKABLE_SLOPE;
    if (groundZ - point.z > climb || !collisionFree(ray, prev, point))
      return false;
    prev = point;
  }
  if (!landing) return false;
  const from: Position = {
    mapId: pose.mapId,
    orientation: pose.orientation,
    x: prev.x,
    y: prev.y,
    z: prev.z,
  };
  return groundStep(ground, from, landing, false).ok;
}

function finiteGround(
  ground: GroundOracle,
  mapId: number,
  point: { x: number; y: number },
  from: NavPoint,
): number | undefined {
  const z = ground.height(mapId, point.x, point.y, from);
  return z === undefined || !Number.isFinite(z) ? undefined : z;
}

export function relativeDeg(heading: number, facing: number): number {
  const delta = normalizeAngle(heading - facing);
  const deg = delta * (180 / Math.PI);
  return delta > Math.PI ? deg - 360 : deg;
}

export function goalBearingText(relative: number): string {
  const rounded = Math.round(relative);
  const size = Math.abs(rounded);
  if (size <= 10) return `almost straight ahead (${aside(rounded)})`;
  if (size <= 35) return `slightly off, ${aside(rounded)}`;
  if (size <= 100) return `well off, ${aside(rounded)}`;
  return `behind you, ${aside(rounded)}`;
}

function aside(rounded: number): string {
  if (rounded === 0) return "dead ahead";
  if (rounded > 0) return `${rounded}° to your left`;
  return `${-rounded}° to your right`;
}

const LAP_LOOKAHEAD_YD = 4;

export function lapPoint(
  objective: Extract<PilotObjective, { kind: "circle" }>,
  pose: { x: number; y: number },
): { x: number; y: number } {
  const around = Math.atan2(pose.y - objective.y, pose.x - objective.x);
  const turn = objective.direction === "counterclockwise" ? 1 : -1;
  const step = Math.min(Math.PI / 2, LAP_LOOKAHEAD_YD / objective.radius);
  const angle = around + turn * step;
  return {
    x: objective.x + objective.radius * Math.cos(angle),
    y: objective.y + objective.radius * Math.sin(angle),
  };
}
