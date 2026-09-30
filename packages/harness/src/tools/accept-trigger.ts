import type { ViewCtx } from "#harness/contract/services";

const RADIUS_YD = 100;

type Point = { x: number; y: number };

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

function text(point: Point): string {
  return `${Math.round(point.x * 100) / 100}, ${Math.round(point.y * 100) / 100}`;
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
