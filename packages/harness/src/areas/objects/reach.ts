import type { DisplayBounds, Rotation } from "@peon/core";

const REACH_YD: Record<number, number> = {
  0: 5,
  2: 5.555_555_3,
  4: 10,
  7: 3,
  9: 5.555_555_3,
  12: 0,
  13: 5,
  14: 5,
  15: 5,
  17: 100,
  19: 10,
  24: 5.555_555_3,
  25: 20.5,
  26: 5.555_555_3,
  27: 5.555_555_3,
  31: 5,
  32: 3,
  33: 5,
  34: 10,
};

export function baseReachYd(type: number): number {
  return REACH_YD[type] ?? 5.5;
}

export type ReachPoint = { x: number; y: number; z: number };

export type ReachTarget = {
  at: ReachPoint;
  type: number;
  bounds: DisplayBounds | undefined;
  scale: number;
  rotation?: Rotation | undefined;
};

const IDENTITY: Rotation = { w: 1, x: 0, y: 0, z: 0 };

export function interactionRadius(type: number): number {
  return baseReachYd(type);
}

export function inscribedReach(target: ReachTarget): number {
  const radius = interactionRadius(target.type);
  if (!(target.bounds && target.scale > 0)) return radius;
  const halfX = ((target.bounds.maxX - target.bounds.minX) / 2) * target.scale;
  const halfY = ((target.bounds.maxY - target.bounds.minY) / 2) * target.scale;
  const inset = Math.min(Math.abs(halfX), Math.abs(halfY));
  if (!(inset > 0)) return radius;
  return radius + inset;
}

function rotateBy(q: Rotation, v: ReachPoint): ReachPoint {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

function ordered(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a];
}

export function inDisplayReach(
  self: ReachPoint,
  target: ReachTarget,
  radius = interactionRadius(target.type),
): boolean {
  const bounds = target.bounds;
  const offset = {
    x: self.x - target.at.x,
    y: self.y - target.at.y,
    z: self.z - target.at.z,
  };
  if (!bounds) return Math.hypot(offset.x, offset.y, offset.z) <= radius;
  const scale = target.scale > 0 ? target.scale : 1;
  const turn = target.rotation ?? IDENTITY;
  const local = rotateBy(
    { w: turn.w, x: -turn.x, y: -turn.y, z: -turn.z },
    offset,
  );
  const [minX, maxX] = ordered(bounds.minX, bounds.maxX);
  const [minY, maxY] = ordered(bounds.minY, bounds.maxY);
  const [minZ, maxZ] = ordered(bounds.minZ, bounds.maxZ);
  return (
    local.x >= minX * scale - radius &&
    local.x <= maxX * scale + radius &&
    local.y >= minY * scale - radius &&
    local.y <= maxY * scale + radius &&
    local.z >= minZ * scale - radius &&
    local.z <= maxZ * scale + radius
  );
}
