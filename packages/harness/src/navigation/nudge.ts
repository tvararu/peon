import { distance2d, type NavPoint, WALKABLE_CLIMB } from "@peon/core";
import type { Navigation } from "#harness/navigation/planner";

export const NUDGE_DEPTH_YD = 0.5;
export const NUDGE_REACH_YD = 1.5;

const FALLBACK_STEPS = 8;

export function nudgeTarget(
  navigation: Navigation,
  mapId: number,
  pose: NavPoint,
): NavPoint | undefined {
  const snap = navigation.snap(mapId, pose);
  if (snap === undefined || snap.onMesh) return undefined;
  for (const candidate of candidates(pose, snap.point)) {
    let z: number | undefined;
    try {
      z = navigation.stepHeight(mapId, candidate.x, candidate.y, pose);
    } catch {
      continue;
    }
    if (Math.abs(z - pose.z) > WALKABLE_CLIMB) continue;
    const at = { ...candidate, z };
    if (distance2d(pose, at) > NUDGE_REACH_YD) continue;
    if (navigation.snap(mapId, at)?.onMesh === true) return at;
  }
  return undefined;
}

function* candidates(pose: NavPoint, onto: NavPoint): Generator<NavPoint> {
  const length = distance2d(pose, onto);
  if (length > 0) {
    const dx = (onto.x - pose.x) / length;
    const dy = (onto.y - pose.y) / length;
    for (let deep = 1; deep <= 2; deep++) {
      const along = NUDGE_DEPTH_YD * deep;
      yield { x: onto.x + dx * along, y: onto.y + dy * along, z: 0 };
    }
  }
  for (let step = 0; step < FALLBACK_STEPS; step++) {
    const angle = (step / FALLBACK_STEPS) * Math.PI * 2;
    yield {
      x: onto.x + Math.cos(angle) * NUDGE_DEPTH_YD,
      y: onto.y + Math.sin(angle) * NUDGE_DEPTH_YD,
      z: 0,
    };
  }
}
