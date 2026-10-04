import { bearing, type ControlEvent, distance, type Vec3 } from "@peon/core";
import type { CycleDeps } from "#harness/loops/encounter-cycle";
import type { EventWaiter } from "#harness/loops/event-waiter";

export const LOOT_REACH_YD = 4;
const STANDOFF_YD = 3;
const MAX_LEGS = 4;
const LEG_MS = 3000;
const MIN_LEG_MS = 200;
const STOP_MARGIN_MS = 1000;
const PROGRESS_YD = 1;

export type CorpseApproach = Pick<
  CycleDeps,
  "control" | "entity" | "observed"
> & {
  motion: EventWaiter<ControlEvent>;
  signal: AbortSignal;
};

export async function approachCorpse(
  run: CorpseApproach,
  guid: bigint,
): Promise<number> {
  for (let legs = 0; legs < MAX_LEGS; legs++) {
    const corpse = run.observed(guid) ?? run.entity(guid)?.position;
    const pose = run.control.snapshot().pose;
    if (!(corpse && pose) || corpse.mapId !== pose.mapId) return legs;
    const gap = distance(pose, corpse);
    if (gap <= LOOT_REACH_YD) return legs;
    if (!(await leg(run, pose, corpse, gap))) return legs + 1;
  }
  return MAX_LEGS;
}

async function leg(
  run: CorpseApproach,
  pose: Vec3,
  corpse: Vec3,
  gap: number,
): Promise<boolean> {
  const { speed } = run.control.snapshot();
  const walk = speed > 0 ? ((gap - STANDOFF_YD) / speed) * 1000 : LEG_MS;
  const ms = Math.round(Math.min(LEG_MS, Math.max(MIN_LEG_MS, walk)));
  try {
    run.control.face(bearing(pose, corpse));
    run.control.move("forward", ms);
  } catch {
    return false;
  }
  const stopped = (event: ControlEvent) => event.type === "movement_stopped";
  await run.motion.find(stopped, ms + STOP_MARGIN_MS, run.signal);
  const after = run.control.snapshot().pose;
  if (!after) return false;
  return distance(pose, corpse) - distance(after, corpse) >= PROGRESS_YD;
}
