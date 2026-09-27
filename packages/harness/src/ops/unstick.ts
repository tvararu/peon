import { ObjectType } from "@tuicraft/core";
import type { OpsCtx } from "#harness/contract/services";
import type { Compass, PoseView } from "#harness/contract/views";
import { ahead, compassOf, SEARCH, STEP, turned } from "#harness/ops/compass";
import { Refusal } from "#harness/ops/refusal";
import { travelLeg } from "#harness/ops/travel-leg";
import { poseView } from "#harness/ops/views";

export type UnstickResult = {
  movedYd: number;
  toward: "last_good_pose" | "open_ground" | "away_from_object";
  refusedGoal: string | undefined;
};

export const UNSTICK_MAX_YD = 5;
export const MIN_UNSTICK_YD = 0.5;
export const UNSTICK_SAMPLE_YD = 8;
const WITHIN_YD = 1;

export function needPose(ctx: OpsCtx): PoseView {
  const pose = poseView(ctx);
  if (!pose)
    throw new Refusal({
      detail: "your position is not known yet.",
      next: "look()",
      reason: "no_pose",
    });
  return pose;
}

function nearestObject(ctx: OpsCtx) {
  const [nearest] = ctx.handle
    .queryNearby()
    .filter(
      (row) =>
        row.entity.objectType === ObjectType.GAMEOBJECT &&
        row.position &&
        row.distance !== null,
    )
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  return nearest?.position;
}

function awayVector(ctx: OpsCtx, pose: PoseView): { dx: number; dy: number } {
  const from = nearestObject(ctx);
  const back = STEP[pose.facing];
  const dx = from ? pose.x - from.x : -back.dx;
  const dy = from ? pose.y - from.y : -back.dy;
  const length = Math.hypot(dx, dy) || 1;
  return { dx: dx / length, dy: dy / length };
}

function awayPoint(
  ctx: OpsCtx,
  pose: PoseView,
): { x: number; y: number; z: number } {
  const { dx, dy } = awayVector(ctx, pose);
  return {
    x: pose.x + dx * UNSTICK_MAX_YD,
    y: pose.y + dy * UNSTICK_MAX_YD,
    z: pose.z,
  };
}

function movedFrom(ctx: OpsCtx, pose: PoseView): number {
  const now = poseView(ctx) ?? pose;
  return Math.hypot(now.x - pose.x, now.y - pose.y);
}

async function openGround(
  ctx: OpsCtx,
  pose: PoseView,
  first: Compass,
): Promise<number> {
  for (const offset of SEARCH) {
    const point = ahead(pose, turned(first, offset), UNSTICK_SAMPLE_YD);
    const leg = await travelLeg(ctx, {
      goal: { kind: "point", ...point },
      within: WITHIN_YD,
    });
    const moved = movedFrom(ctx, pose);
    if (
      moved >= MIN_UNSTICK_YD ||
      leg.status === "cancelled" ||
      leg.status === "interrupted"
    )
      return moved;
  }
  return 0;
}

export async function unstick(
  ctx: OpsCtx,
  away?: Compass,
): Promise<UnstickResult> {
  const pose = needPose(ctx);
  const good = ctx.rt.travel.lastGoodPose;
  const refusedGoal = ctx.rt.travel.lastRefusedGoal;
  const back =
    good && good.mapId === pose.mapId
      ? Math.hypot(good.x - pose.x, good.y - pose.y)
      : 0;
  if (good && back >= MIN_UNSTICK_YD) {
    const outcome = await ctx.handle.walkToward(
      { kind: "point", x: good.x, y: good.y, z: good.z },
      Math.min(UNSTICK_MAX_YD, back),
      ctx.signal,
    );
    if (outcome.traveled >= MIN_UNSTICK_YD)
      return {
        movedYd: outcome.traveled,
        refusedGoal,
        toward: "last_good_pose",
      };
  }
  const first = away ?? compassOf(awayVector(ctx, pose));
  const routed = await openGround(ctx, pose, first);
  if (routed >= MIN_UNSTICK_YD)
    return { movedYd: routed, refusedGoal, toward: "open_ground" };
  const outcome = await ctx.handle.walkToward(
    { kind: "point", ...awayPoint(ctx, pose) },
    UNSTICK_MAX_YD,
    ctx.signal,
  );
  return { movedYd: outcome.traveled, refusedGoal, toward: "away_from_object" };
}
