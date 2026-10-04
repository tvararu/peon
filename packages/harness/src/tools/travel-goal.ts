import type { TravelAfter } from "#harness/contract/details";
import type { ToolCtx } from "#harness/contract/services";
import { ahead } from "#harness/ops/compass";
import { parseDirection } from "#harness/ops/explore";
import { Refusal } from "#harness/ops/refusal";
import { poseView } from "#harness/ops/views";
import { nextCall } from "#harness/tools/next-call";
import type { Goal } from "#harness/tools/travel-report";

export const COORDS =
  /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*(?:,\s*(-?\d+(?:\.\d+)?)\s*)?$/;
export const YARDS_MAX = 200;
export const YARDS =
  /^\s*(\d+(?:\.\d+)?)\s*(?:yd|yds|yards?)\s*(?:to\s+the\s+|to\s+)?([a-z]+)\s*$/i;

export function pointGoal(coords: RegExpExecArray): Goal {
  return {
    kind: "point",
    x: Number(coords[1]),
    y: Number(coords[2]),
    z: coords[3] === undefined ? undefined : Number(coords[3]),
  };
}

export function parseYards(
  ctx: ToolCtx<TravelAfter>,
  text: string,
  match: RegExpExecArray,
): Goal {
  const direction = parseDirection(match[2] ?? "");
  if (!direction)
    throw new Refusal({
      detail: `"${text}" is not a direction.`,
      next: nextCall("travel", { to: "10 yd north" }),
      reason: "bad_direction",
    });
  const yards = Number(match[1]);
  if (!(yards > 0) || yards > YARDS_MAX)
    throw new Refusal({
      detail: `"${text}" needs a distance from 1 to ${YARDS_MAX} yards.`,
      next: nextCall("travel", { to: "10 yd north" }),
      reason: "bad_distance",
    });
  const pose = poseView(ctx);
  if (!pose)
    throw new Refusal({
      detail: "your position is not known yet.",
      next: "look()",
      reason: "no_pose",
    });
  const point = ahead(pose, direction, yards);
  return { kind: "point", x: point.x, y: point.y, z: undefined };
}
