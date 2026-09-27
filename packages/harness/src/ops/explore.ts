import { ObjectType } from "@tuicraft/core";
import type { LegView } from "#harness/contract/details";
import type { OpsCtx, ViewCtx } from "#harness/contract/services";
import type { Compass, PoseView, UnitView } from "#harness/contract/views";
import { dangerView } from "#harness/ops/danger";
import { Refusal } from "#harness/ops/refusal";
import { type LegResult, travelLeg } from "#harness/ops/travel-leg";
import { structuralReach } from "#harness/ops/unreached";
import { poseView, unitViews } from "#harness/ops/views";

export type UnstickResult = {
  movedYd: number;
  toward: "last_good_pose" | "open_ground" | "away_from_object";
  refusedGoal: string | undefined;
};
export type ExploreStop =
  | "new_unit"
  | "danger"
  | "obstructed"
  | "explored"
  | "distance";
export type ExploreResult = {
  direction: Compass;
  walkedYd: number;
  legs: LegView[];
  obstructed: number;
  newInView: UnitView[];
  stoppedBy: ExploreStop;
  untried: Compass | undefined;
  obstructedHere: number;
  unstuck: "moved" | "failed" | undefined;
};

export const UNSTICK_MAX_YD = 5;
export const EXPLORE_MAX_YD = 100;
export const EXPLORE_MAX_OBSTRUCTED = 3;
const CELL_YD = 20;
const LEG_YD = 20;
const LEG_WITHIN_YD = 1;
const MAX_ROUNDS = 8;
const AHEAD_YD = [20, 40, 60, 80, 100];
const AWAY_BUCKET_YD = 20;
const NEAR_CELLS_YD = 250;
const SIDES = [1, -1];
export const SIDE_REASONS: ReadonlySet<string> = new Set([
  "no_ground",
  "end_snapped_off",
  "ambiguous_floor",
]);
export const MIN_UNSTICK_YD = 0.5;
export const UNSTICK_SAMPLE_YD = 8;
const RING: readonly Compass[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const SEARCH = [0, 1, -1, 2, -2, 3, -3, 4];
const TURNS = [0, 1, -1, 2, -2];
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

function blockedFrom(ctx: ViewCtx, at: PoseView): Set<Compass> {
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

function visitedAhead(ctx: ViewCtx, pose: PoseView, direction: Compass) {
  return AHEAD_YD.filter((yards) =>
    ctx.rt.travel.visitedCells.has(
      cellKey({ mapId: pose.mapId, ...ahead(pose, direction, yards) }),
    ),
  ).length;
}

function awayFromStart(ctx: ViewCtx, pose: PoseView, direction: Compass) {
  const origin = ctx.rt.travel.exploreOrigin;
  const from = origin?.mapId === pose.mapId ? origin : pose;
  const to = ahead(pose, direction, EXPLORE_MAX_YD);
  return Math.round(Math.hypot(to.x - from.x, to.y - from.y) / AWAY_BUCKET_YD);
}

function friendlyToward(units: readonly UnitView[], direction: Compass) {
  return units.filter(
    (unit) =>
      unit.kind === "creature" &&
      unit.relation === "friendly" &&
      unit.compass === direction,
  ).length;
}

function bestDirection(
  ctx: ViewCtx,
  pose: PoseView,
  skip: ReadonlySet<Compass>,
): Compass | undefined {
  const units = unitViews(ctx);
  const [best] = SEARCH.map((offset) => turned(pose.facing, offset))
    .filter((direction) => !skip.has(direction))
    .map((direction, order) => ({
      away: awayFromStart(ctx, pose, direction),
      direction,
      friendly: friendlyToward(units, direction),
      order,
      visited: visitedAhead(ctx, pose, direction),
    }))
    .sort(
      (a, b) =>
        a.visited - b.visited ||
        b.away - a.away ||
        a.friendly - b.friendly ||
        a.order - b.order,
    );
  return best?.direction;
}

function pickDirection(ctx: OpsCtx, pose: PoseView): Compass {
  return bestDirection(ctx, pose, blockedFrom(ctx, pose)) ?? pose.facing;
}

function cellCenter(key: string): { mapId: number; x: number; y: number } {
  const [mapId = 0, cx = 0, cy = 0] = key.split(":").map(Number);
  return { mapId, x: (cx + 0.5) * CELL_YD, y: (cy + 0.5) * CELL_YD };
}

export type ExploreSummary = {
  tried: Compass[];
  farthestYd: number;
  next: Compass | undefined;
};

export function exploreSummary(ctx: ViewCtx): ExploreSummary | undefined {
  const pose = poseView(ctx);
  if (!pose) return;
  const near = (at: { mapId: number; x: number; y: number }, yards: number) =>
    at.mapId === pose.mapId &&
    Math.hypot(at.x - pose.x, at.y - pose.y) <= yards;
  const tried = [
    ...new Set(
      ctx.rt.travel.explores
        .filter((mark) => near(mark, EXPLORE_MAX_YD))
        .map((mark) => mark.direction),
    ),
  ];
  const farthestYd = Math.max(
    0,
    ...[...ctx.rt.travel.visitedCells]
      .map(cellCenter)
      .filter((center) => near(center, NEAR_CELLS_YD))
      .map((center) => Math.hypot(center.x - pose.x, center.y - pose.y)),
  );
  const skip = new Set([...blockedFrom(ctx, pose), ...tried]);
  return {
    farthestYd: Math.round(farthestYd),
    next: bestDirection(ctx, pose, skip),
    tried,
  };
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

function legYd(walk: Walk): number {
  return Math.min(LEG_YD, EXPLORE_MAX_YD - walk.walkedYd);
}

function unexplored(
  ctx: ViewCtx,
  from: PoseView,
  direction: Compass,
  yards: number,
): boolean {
  const key = cellKey({ mapId: from.mapId, ...ahead(from, direction, yards) });
  return key === cellKey(from) || !ctx.rt.travel.visitedCells.has(key);
}

function freshBearing(walk: Walk, from: PoseView): Compass | undefined {
  const blocked = blockedFrom(walk.ctx, from);
  return TURNS.map((offset) => turned(walk.direction, offset)).find(
    (direction) =>
      (direction === walk.direction || !blocked.has(direction)) &&
      unexplored(walk.ctx, from, direction, legYd(walk)),
  );
}

function unexploredFrom(
  ctx: ViewCtx,
  pose: PoseView,
  from: Compass,
): Compass | undefined {
  const blocked = blockedFrom(ctx, pose);
  return SEARCH.map((offset) => turned(from, offset)).find(
    (direction) =>
      !blocked.has(direction) && unexplored(ctx, pose, direction, LEG_YD),
  );
}

async function walkBearing(
  walk: Walk,
  from: PoseView,
  direction: Compass,
): Promise<LegResult> {
  const { ctx } = walk;
  const point = ahead(from, direction, legYd(walk));
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
  bearing: Compass,
  first: LegResult,
): Promise<LegResult> {
  if (first.status === "arrived" || stopped(walk, first)) return first;
  if (!SIDE_REASONS.has(first.reason ?? "")) return first;
  let leg = first;
  for (const offset of SIDES) {
    const side = turned(bearing, offset);
    if (blockedFrom(walk.ctx, from).has(side)) continue;
    if (!unexplored(walk.ctx, from, side, legYd(walk))) continue;
    leg = await walkBearing(walk, poseView(walk.ctx) ?? from, side);
    if (leg.status === "arrived" || stopped(walk, leg)) return leg;
  }
  return leg;
}

async function walkLeg(
  walk: Walk,
  start: PoseView,
): Promise<ExploreStop | undefined> {
  const from = poseView(walk.ctx) ?? start;
  const bearing = freshBearing(walk, from);
  if (!bearing) return "explored";
  walk.rounds += 1;
  const leg = await sideTries(
    walk,
    from,
    bearing,
    await walkBearing(walk, from, bearing),
  );
  const fresh = freshUnits(walk);
  if (stopped(walk, leg)) return "danger";
  if (fresh.some(walk.wanted)) return "new_unit";
  if (leg.status === "arrived") return;
  walk.obstructed += 1;
  return walk.obstructed >= EXPLORE_MAX_OBSTRUCTED ? "obstructed" : undefined;
}

function startFault(walk: Walk): boolean {
  const reasons = new Set(walk.legs.map((leg) => leg.reason));
  const [reason] = reasons;
  return (
    walk.walkedYd === 0 &&
    reasons.size === 1 &&
    reason !== undefined &&
    !SIDE_REASONS.has(reason) &&
    structuralReach({ detail: reason, reason }) !== "unsupported_map"
  );
}

async function walkLegs(walk: Walk, start: PoseView) {
  let stoppedBy: ExploreStop | undefined;
  while (
    !stoppedBy &&
    EXPLORE_MAX_YD - walk.walkedYd >= LEG_WITHIN_YD &&
    walk.rounds < MAX_ROUNDS
  )
    stoppedBy = await walkLeg(walk, start);
  return stoppedBy;
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
  const origin = ctx.rt.travel.exploreOrigin;
  if (origin?.mapId !== start.mapId)
    ctx.rt.travel.exploreOrigin = {
      mapId: start.mapId,
      x: start.x,
      y: start.y,
    };
  ctx.rt.travel.explores.push({
    direction: walk.direction,
    mapId: start.mapId,
    x: start.x,
    y: start.y,
  });
  let stoppedBy = await walkLegs(walk, start);
  let unstuck: ExploreResult["unstuck"];
  if (stoppedBy === "obstructed" && startFault(walk)) {
    const moved = await unstick(ctx, turned(walk.direction, 4)).then(
      (done) => done.movedYd,
      () => 0,
    );
    unstuck = moved >= MIN_UNSTICK_YD ? "moved" : "failed";
    if (unstuck === "moved") {
      walk.walkedYd += moved;
      walk.obstructed = 0;
      walk.rounds = 0;
      stoppedBy = await walkLegs(walk, needPose(ctx));
    }
  }
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
    unstuck,
    untried:
      stoppedBy === "explored"
        ? unexploredFrom(ctx, end, direction)
        : untriedFrom(ctx, end, direction),
    walkedYd,
  };
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

function compassOf({ dx, dy }: { dx: number; dy: number }): Compass {
  const index = Math.round(Math.atan2(-dy, dx) / (Math.PI / 4));
  return RING[(index + RING.length) % RING.length] ?? "N";
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
      within: LEG_WITHIN_YD,
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
