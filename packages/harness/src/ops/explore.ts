import { ObjectType } from "@tuicraft/core";
import type { LegView } from "#harness/contract/details";
import type { OpsCtx } from "#harness/contract/services";
import type { Compass, PoseView, UnitView } from "#harness/contract/views";
import { dangerView } from "#harness/ops/danger";
import { Refusal } from "#harness/ops/refusal";
import { type LegResult, travelLeg } from "#harness/ops/travel-leg";
import { poseView, unitViews } from "#harness/ops/views";

export type UnstickResult = {
  movedYd: number;
  toward: "last_good_pose" | "away_from_object";
  refusedGoal: string | undefined;
};
export type ExploreStop = "new_unit" | "danger" | "obstructed" | "distance";
export type ExploreResult = {
  direction: Compass;
  walkedYd: number;
  legs: LegView[];
  obstructed: number;
  newInView: UnitView[];
  stoppedBy: ExploreStop;
  untried: Compass | undefined;
  obstructedHere: number;
};

export const UNSTICK_MAX_YD = 5;
export const EXPLORE_MAX_YD = 40;
export const EXPLORE_MAX_OBSTRUCTED = 3;
const CELL_YD = 20;
const LEG_YD = 20;
const LEG_WITHIN_YD = 1;
const MAX_ROUNDS = 6;
const SIDES = [1, -1];
export const SIDE_REASONS: ReadonlySet<string> = new Set([
  "no_ground",
  "end_snapped_off",
  "ambiguous_floor",
]);
const MIN_UNSTICK_YD = 0.5;
const RING: readonly Compass[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const SEARCH = [0, 1, -1, 2, -2, 3, -3, 4];
const WORDS: Record<string, Compass> = {
  east: "E",
  north: "N",
  northeast: "NE",
  northwest: "NW",
  south: "S",
  southeast: "SE",
  southwest: "SW",
  west: "W",
};
const DIAGONAL = Math.SQRT1_2;
const EXPLORE_PREFIX = /^explore\s*/;
const STEP: Record<Compass, { dx: number; dy: number }> = {
  E: { dx: 0, dy: -1 },
  N: { dx: 1, dy: 0 },
  NE: { dx: DIAGONAL, dy: -DIAGONAL },
  NW: { dx: DIAGONAL, dy: DIAGONAL },
  S: { dx: -1, dy: 0 },
  SE: { dx: -DIAGONAL, dy: -DIAGONAL },
  SW: { dx: -DIAGONAL, dy: DIAGONAL },
  W: { dx: 0, dy: 1 },
};

export function compassWord(compass: Compass): string {
  return (
    Object.entries(WORDS).find(([, value]) => value === compass)?.[0] ?? compass
  );
}

export function parseDirection(text: string): Compass | undefined {
  const word = text.trim().toLowerCase().replace(EXPLORE_PREFIX, "");
  if (word === "") return undefined;
  return WORDS[word] ?? RING.find((compass) => compass.toLowerCase() === word);
}

function cellKey(at: { mapId: number; x: number; y: number }): string {
  return `${at.mapId}:${Math.floor(at.x / CELL_YD)}:${Math.floor(at.y / CELL_YD)}`;
}

function ahead(
  pose: PoseView,
  direction: Compass,
  yards: number,
): { x: number; y: number } {
  const step = STEP[direction];
  return { x: pose.x + step.dx * yards, y: pose.y + step.dy * yards };
}

function needPose(ctx: OpsCtx): PoseView {
  const pose = poseView(ctx);
  if (!pose)
    throw new Refusal({
      detail: "your position is not known yet.",
      next: "look()",
      reason: "no_pose",
    });
  return pose;
}

function blockedFrom(ctx: OpsCtx, at: PoseView): Set<Compass> {
  return ctx.rt.travel.blockedBearings.get(cellKey(at)) ?? new Set();
}

function block(ctx: OpsCtx, at: PoseView, direction: Compass): void {
  const key = cellKey(at);
  const blocked = ctx.rt.travel.blockedBearings.get(key) ?? new Set();
  blocked.add(direction);
  ctx.rt.travel.blockedBearings.set(key, blocked);
}

function noteObstructed(ctx: OpsCtx, at: PoseView, direction: Compass): number {
  const key = cellKey(at);
  const tried = ctx.rt.travel.obstructedExplores.get(key) ?? new Set();
  tried.add(direction);
  ctx.rt.travel.obstructedExplores.set(key, tried);
  return tried.size;
}

function turned(direction: Compass, offset: number): Compass {
  const index = RING.indexOf(direction) + offset;
  return RING[(index + RING.length) % RING.length] ?? direction;
}

function untriedFrom(
  ctx: OpsCtx,
  pose: PoseView,
  from: Compass,
): Compass | undefined {
  const blocked = blockedFrom(ctx, pose);
  return SEARCH.map((offset) => turned(from, offset)).find(
    (direction) => !blocked.has(direction),
  );
}

function pickDirection(ctx: OpsCtx, pose: PoseView): Compass {
  const blocked = blockedFrom(ctx, pose);
  const open = SEARCH.map((offset) => turned(pose.facing, offset)).filter(
    (direction) => !blocked.has(direction),
  );
  return (
    open.find(
      (direction) =>
        !ctx.rt.travel.visitedCells.has(
          cellKey({ mapId: pose.mapId, ...ahead(pose, direction, CELL_YD) }),
        ),
    ) ??
    open[0] ??
    pose.facing
  );
}

function interesting(unit: UnitView): boolean {
  return unit.attackable || unit.roles.length > 0;
}

type Walk = {
  ctx: OpsCtx;
  direction: Compass;
  wanted: (unit: UnitView) => boolean;
  seen: Set<string>;
  legs: LegView[];
  newInView: UnitView[];
  walkedYd: number;
  obstructed: number;
  rounds: number;
};

function freshUnits(walk: Walk): UnitView[] {
  const fresh = unitViews(walk.ctx).filter((unit) => !walk.seen.has(unit.guid));
  for (const unit of fresh) {
    walk.seen.add(unit.guid);
    walk.newInView.push(unit);
  }
  return fresh;
}

function stopped(walk: Walk, leg: LegResult): boolean {
  return (
    leg.status === "cancelled" ||
    leg.status === "interrupted" ||
    dangerView(walk.ctx).attackers.length > 0
  );
}

async function walkBearing(
  walk: Walk,
  from: PoseView,
  direction: Compass,
): Promise<LegResult> {
  const { ctx } = walk;
  const point = ahead(
    from,
    direction,
    Math.min(LEG_YD, EXPLORE_MAX_YD - walk.walkedYd),
  );
  const leg = await travelLeg(ctx, {
    goal: { kind: "point", ...point },
    within: LEG_WITHIN_YD,
  });
  const to = poseView(ctx) ?? from;
  walk.walkedYd += Math.hypot(to.x - from.x, to.y - from.y);
  ctx.rt.travel.visitedCells.add(cellKey(to));
  if (leg.status === "refused" || leg.status === "failed")
    block(ctx, from, direction);
  walk.legs.push({
    index: walk.legs.length,
    reason: leg.reason,
    status: leg.status,
    traveledYd: leg.traveledYd,
  });
  return leg;
}

async function sideTries(
  walk: Walk,
  from: PoseView,
  first: LegResult,
): Promise<LegResult> {
  let leg = first;
  for (const offset of SIDES) {
    if (leg.status === "arrived" || stopped(walk, leg)) return leg;
    if (!SIDE_REASONS.has(leg.reason ?? "")) return leg;
    const side = turned(walk.direction, offset);
    if (blockedFrom(walk.ctx, from).has(side)) continue;
    leg = await walkBearing(walk, poseView(walk.ctx) ?? from, side);
  }
  return leg;
}

async function walkLeg(
  walk: Walk,
  start: PoseView,
): Promise<ExploreStop | undefined> {
  const from = poseView(walk.ctx) ?? start;
  walk.rounds += 1;
  const leg = await sideTries(
    walk,
    from,
    await walkBearing(walk, from, walk.direction),
  );
  const fresh = freshUnits(walk);
  if (stopped(walk, leg)) return "danger";
  if (fresh.some(walk.wanted)) return "new_unit";
  if (leg.status === "arrived") return;
  walk.obstructed += 1;
  return walk.obstructed >= EXPLORE_MAX_OBSTRUCTED ? "obstructed" : undefined;
}

export async function explore(
  ctx: OpsCtx,
  init: {
    direction: Compass | undefined;
    wanted?: (unit: UnitView) => boolean;
  },
): Promise<ExploreResult> {
  const start = needPose(ctx);
  const walk: Walk = {
    ctx,
    direction: init.direction ?? pickDirection(ctx, start),
    legs: [],
    newInView: [],
    obstructed: 0,
    rounds: 0,
    seen: new Set(unitViews(ctx).map((unit) => unit.guid)),
    walkedYd: 0,
    wanted: init.wanted ?? interesting,
  };
  ctx.rt.travel.visitedCells.add(cellKey(start));
  let stoppedBy: ExploreStop | undefined;
  while (
    !stoppedBy &&
    EXPLORE_MAX_YD - walk.walkedYd >= LEG_WITHIN_YD &&
    walk.rounds < MAX_ROUNDS
  )
    stoppedBy = await walkLeg(walk, start);
  const { direction, legs, newInView, obstructed, walkedYd } = walk;
  const end = poseView(ctx) ?? start;
  return {
    direction,
    legs,
    newInView,
    obstructed,
    obstructedHere:
      stoppedBy === "obstructed" ? noteObstructed(ctx, end, direction) : 0,
    stoppedBy: stoppedBy ?? "distance",
    untried: untriedFrom(ctx, end, direction),
    walkedYd,
  };
}

function awayPoint(
  ctx: OpsCtx,
  pose: PoseView,
): { x: number; y: number; z: number } {
  const [nearest] = ctx.handle
    .queryNearby()
    .filter(
      (row) =>
        row.entity.objectType === ObjectType.GAMEOBJECT &&
        row.position &&
        row.distance !== null,
    )
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  const from = nearest?.position;
  const back = STEP[pose.facing];
  const dx = from ? pose.x - from.x : -back.dx;
  const dy = from ? pose.y - from.y : -back.dy;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: pose.x + (dx / length) * UNSTICK_MAX_YD,
    y: pose.y + (dy / length) * UNSTICK_MAX_YD,
    z: pose.z,
  };
}

export async function unstick(ctx: OpsCtx): Promise<UnstickResult> {
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
    return { movedYd: outcome.traveled, refusedGoal, toward: "last_good_pose" };
  }
  const outcome = await ctx.handle.walkToward(
    { kind: "point", ...awayPoint(ctx, pose) },
    UNSTICK_MAX_YD,
    ctx.signal,
  );
  return { movedYd: outcome.traveled, refusedGoal, toward: "away_from_object" };
}
