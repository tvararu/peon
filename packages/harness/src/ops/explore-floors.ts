import type { OpsCtx } from "#harness/contract/services";
import type { Compass, PoseView } from "#harness/contract/views";
import { ahead } from "#harness/ops/compass";
import { EXPLORE_MAX_YD } from "#harness/ops/explore";
import { type LegResult, travelLeg } from "#harness/ops/travel-leg";

export type FloorWalk = {
  ctx: OpsCtx;
  refused: Set<string>;
  walkedYd: number;
  withinYd: number;
  blockBearing: (from: PoseView, direction: Compass) => void;
  goalKey: (point: { x: number; y: number }) => string;
  pushLeg: (leg: LegResult) => void;
  stopped: (leg: LegResult) => boolean;
};

const AMBIGUOUS_YD = [10, 30, 40];

export async function floorRetries(
  walk: FloorWalk,
  from: PoseView,
  direction: Compass,
  first: LegResult,
): Promise<LegResult> {
  let leg = first;
  for (const yards of AMBIGUOUS_YD) {
    if (yards > EXPLORE_MAX_YD - walk.walkedYd) continue;
    const point = ahead(from, direction, yards);
    const key = walk.goalKey(point);
    if (walk.refused.has(key)) continue;
    leg = await travelLeg(walk.ctx, {
      goal: { kind: "point", ...point },
      within: walk.withinYd,
    });
    walk.pushLeg(leg);
    if (leg.status === "arrived" || walk.stopped(leg)) return leg;
    walk.refused.add(key);
    if (leg.reason !== "ambiguous_floor") {
      walk.refused.delete(key);
      walk.blockBearing(from, direction);
      return leg;
    }
  }
  return leg;
}
