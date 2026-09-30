import { questSlotStatus } from "@peon/core";
import type { ViewCtx } from "#harness/contract/services";
import { nextCall } from "#harness/tools/next-call";

const RADIUS_YD = 100;

type Point = { x: number; y: number };
type Spot = Point & { z: number };

function inside(polygon: readonly Point[], at: Point): boolean {
  let within = false;
  let prev = polygon.length - 1;
  for (let index = 0; index < polygon.length; index++) {
    const one = polygon[index];
    const other = polygon[prev];
    if (
      one &&
      other &&
      one.y > at.y !== other.y > at.y &&
      at.x < ((other.x - one.x) * (at.y - one.y)) / (other.y - one.y) + one.x
    )
      within = !within;
    prev = index;
  }
  return within;
}

function pointOf(to: string): Point | undefined {
  const [x, y] = to.split(",").map(Number);
  if (x === undefined || y === undefined) return undefined;
  if (Number.isNaN(x) || Number.isNaN(y)) return undefined;
  return { x, y };
}

function text(point: Spot): string {
  const rounded = [point.x, point.y, point.z].map(
    (value) => Math.round(value * 100) / 100,
  );
  return rounded.join(", ");
}

export function triggersOf(
  ctx: ViewCtx,
  region: { points: readonly Point[]; to: string },
): string[] {
  const pose = ctx.handle.getControlState().pose;
  const centre = pointOf(region.to);
  if (!(pose && centre)) return [];
  const near = ctx.handle.objects.act.triggersNear(
    pose.mapId,
    centre.x,
    centre.y,
    RADIUS_YD,
  );
  const within = near
    .filter((trigger) => inside(region.points, trigger))
    .sort(
      (one, other) =>
        Math.hypot(one.x - pose.x, one.y - pose.y) -
        Math.hypot(other.x - pose.x, other.y - pose.y),
    );
  if (within.length > 0) return within.map(text);
  return near.slice(0, 1).map(text);
}

export function nextTrigger(ctx: ViewCtx, at: string): string | undefined {
  const chain = ctx.rt.travel.triggers;
  if (!chain) return undefined;
  const index = chain.points.indexOf(at);
  if (index < 0) return undefined;
  const slot = ctx.handle
    .getQuestState()
    .log.slots.find((known) => known.questId === chain.questId);
  const next = chain.points[index + 1];
  if (!slot || questSlotStatus(slot) !== "in progress" || next === undefined) {
    ctx.rt.travel.triggers = undefined;
    return undefined;
  }
  return nextCall("travel", { to: next });
}
