import { distance2d } from "#wow/geometry";

export type NavPoint = { x: number; y: number; z: number };

export const GROUND_ERROR = 0.25;
export const MESH_HEIGHT = 1.6;
export const WALKABLE_CLIMB = 1;
export const CELL_HEIGHT = 0.25;
export const WALKABLE_SLOPE = Math.tan((50 * Math.PI) / 180);
const SAFE_DROP = 13;

type Ray = (from: NavPoint, to: NavPoint) => boolean;

export function collisionFree(
  ray: Ray,
  from: NavPoint,
  to: NavPoint,
  climb = 0,
): boolean {
  const lowFrom = { ...from, z: from.z + GROUND_ERROR };
  const lowTo = { ...to, z: to.z + GROUND_ERROR };
  const highFrom = { ...from, z: from.z + MESH_HEIGHT };
  const highTo = { ...to, z: to.z + MESH_HEIGHT };
  return (
    (ray(lowFrom, lowTo) || stepClear(ray, lowFrom, lowTo, climb)) &&
    ray(highFrom, highTo) &&
    ray(lowTo, highTo)
  );
}

function stepClear(
  ray: Ray,
  lowFrom: NavPoint,
  lowTo: NavPoint,
  climb: number,
): boolean {
  const rise = lowTo.z - lowFrom.z;
  if (rise === 0 || Math.abs(rise) > climb) return false;
  if (rise < 0) return ray(lowFrom, { ...lowTo, z: lowFrom.z });
  const riser = { ...lowFrom, z: lowTo.z };
  return ray(lowFrom, riser) && ray(riser, lowTo);
}

export function withinStep(from: NavPoint, to: NavPoint): boolean {
  const reach = CELL_HEIGHT + distance2d(from, to) * WALKABLE_SLOPE;
  const rise = to.z - from.z;
  return rise <= reach && rise >= -Math.max(reach, SAFE_DROP);
}
