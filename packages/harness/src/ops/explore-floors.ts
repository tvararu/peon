import type { OpsCtx } from "#harness/contract/services";
import type { Compass, PoseView } from "#harness/contract/views";
import { ahead } from "#harness/ops/compass";
import { type LegResult, travelLeg } from "#harness/ops/travel-leg";

export type FloorWalk = {
  ctx: OpsCtx;
  refused: Set<string>;
  probed: Set<string>;
  walkedYd: number;
  withinYd: number;
  blockBearing: (from: PoseView, direction: Compass) => void;
  goalKey: (point: { x: number; y: number }) => string;
  pushLeg: (leg: LegResult) => void;
  stopped: (leg: LegResult) => boolean;
};

export async function floorRetries(
  walk: FloorWalk,
  from: PoseView,
  direction: Compass,
  first: LegResult,
): Promise<LegResult> {
  let leg = first;
  const start = ahead(from, direction, 20);
  const startKey = walk.goalKey(start);
  if (walk.refused.has(startKey)) walk.probed.add(startKey);
  for (const yards of [10, 30, 40]) {
    if (yards > 100 - walk.walkedYd) continue;
    const point = ahead(from, direction, yards);
    const key = walk.goalKey(point);
    if (walk.refused.has(key) || walk.probed.has(key)) continue;
    walk.probed.add(key);
    leg = await travelLeg(walk.ctx, {
      goal: { kind: "point", ...point },
      within: walk.withinYd,
    });
    walk.pushLeg(leg);
    if (leg.status === "arrived" || walk.stopped(leg)) return leg;
    if (leg.reason !== "ambiguous_floor") {
      walk.blockBearing(from, direction);
      return leg;
    }
  }
  return leg;
}
