import type { ViewCtx } from "#harness/contract/services";
import type { Compass } from "#harness/contract/views";
import { compassOf } from "#harness/ops/views";

export const TALK_RANGE_YD = 5;
export const INTERACT_APPROACH_YD = 4;
export const LOOT_APPROACH_YD = 3;
export const LOOT_WALK_MAX_YD = 30;
export const ENGAGE_APPROACH_YD = 30;
export const LOOK_DEFAULT_YD = 60;
export const LOOK_DEFAULT_ROWS = 6;
export const LOOK_MAX_ROWS = 20;

export function distanceTo(
  { handle, rt }: ViewCtx,
  guid: bigint,
): number | undefined {
  const distance = handle
    .queryNearby({ all: true })
    .find((row) => row.entity.guid === guid)?.distance;
  if (typeof distance === "number") return distance;
  const sighting = rt.sightings.get(guid);
  const { pose } = handle.getControlState();
  if (!(sighting && pose) || sighting.mapId !== pose.mapId) return;
  return Math.hypot(sighting.x - pose.x, sighting.y - pose.y);
}

export function compassTo(
  from: { x: number; y: number },
  to: { x: number; y: number },
): Compass {
  return compassOf(Math.atan2(to.y - from.y, to.x - from.x));
}
