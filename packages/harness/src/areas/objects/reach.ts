import type { DisplayBounds } from "@peon/core";
import { baseReachYd } from "#harness/areas/objects/reads";

export type ReachPoint = { x: number; y: number; z: number };

export type ReachTarget = {
  at: ReachPoint;
  type: number;
  bounds: DisplayBounds | undefined;
  scale: number;
};

export function interactionRadius(type: number): number {
  return baseReachYd(type);
}

export function inscribedReach(target: ReachTarget): number {
  const radius = interactionRadius(target.type);
  if (!(target.bounds && target.scale > 0)) return radius;
  const halfX = ((target.bounds.maxX - target.bounds.minX) / 2) * target.scale;
  const halfY = ((target.bounds.maxY - target.bounds.minY) / 2) * target.scale;
  const inset = Math.min(halfX, halfY);
  if (!(inset > 0)) return radius;
  return radius + inset;
}

export function inDisplayReach(
  self: ReachPoint,
  target: ReachTarget,
  orientation = 0,
): boolean {
  const radius = interactionRadius(target.type);
  const bounds = target.bounds;
  const scale = target.scale > 0 ? target.scale : 1;
  if (!bounds) {
    return (
      Math.hypot(
        self.x - target.at.x,
        self.y - target.at.y,
        self.z - target.at.z,
      ) <= radius
    );
  }
  const cos = Math.cos(-orientation);
  const sin = Math.sin(-orientation);
  const dx = self.x - target.at.x;
  const dy = self.y - target.at.y;
  const local = {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos,
    z: self.z - target.at.z,
  };
  return (
    local.x >= bounds.minX * scale - radius &&
    local.y >= bounds.minY * scale - radius &&
    local.z >= bounds.minZ * scale - radius &&
    local.x <= bounds.maxX * scale + radius &&
    local.y <= bounds.maxY * scale + radius &&
    local.z <= bounds.maxZ * scale + radius
  );
}
