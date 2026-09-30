import type { TravelRecovery, ViewCtx } from "#harness/contract/services";
import { poseView } from "#harness/ops/views";
import { nextTrigger } from "#harness/tools/accept-trigger";
import { nextCall } from "#harness/tools/next-call";

const LADDER: ReadonlySet<string> = new Set([
  "ambiguous_ground_column",
  "path_corner_disagrees",
]);
const WAYPOINT_YD = 25;
const UNSTICK = nextCall("travel", { to: "unstick" });
const WAYPOINT_STEP = "a waypoint toward the goal";

function coord(n: number): string {
  return String(Math.round(n * 10) / 10);
}

export function recoveryFor(
  ctx: ViewCtx,
  to: string,
  name: string,
): TravelRecovery {
  const known = ctx.rt.travel.recovery;
  if (known && (known.goal === to || known.waypoint === to)) return known;
  const fresh = {
    goal: to,
    name,
    unstuck: false,
    waypoint: undefined,
    waypointTried: false,
  };
  ctx.rt.travel.recovery = fresh;
  return fresh;
}

export function noteUnstick(ctx: ViewCtx): void {
  const known = ctx.rt.travel.recovery;
  if (known) known.unstuck = true;
}

export function noteTravel(ctx: ViewCtx, to: string): void {
  const known = ctx.rt.travel.recovery;
  if (known && known.waypoint === to) known.waypointTried = true;
}

export function arrivedNext(ctx: ViewCtx, to: string): string | undefined {
  const known = ctx.rt.travel.recovery;
  if (known?.goal === to) ctx.rt.travel.recovery = undefined;
  else if (known?.waypoint === to)
    return nextCall("travel", { to: known.goal });
  return nextTrigger(ctx, to);
}

export function triedText(recovery: TravelRecovery, planner: string): string {
  const steps = [
    planner,
    ...(recovery.unstuck ? [UNSTICK] : []),
    ...(recovery.waypointTried && recovery.waypoint
      ? [nextCall("travel", { to: recovery.waypoint })]
      : []),
  ];
  return `Tried: ${steps.join(", ")}.`;
}

export function notTriedText(recovery: TravelRecovery): string {
  const steps = [
    ...(recovery.unstuck ? [] : [UNSTICK]),
    ...(recovery.waypointTried ? [] : [WAYPOINT_STEP]),
  ];
  return steps.length === 0
    ? "Not tried: another destination."
    : `Not tried: ${steps.join(", ")}.`;
}

function waypointOf(
  ctx: ViewCtx,
  goal: { x: number | undefined; y: number | undefined },
): string | undefined {
  const pose = poseView(ctx);
  if (!pose || goal.x === undefined || goal.y === undefined) return;
  const dx = goal.x - pose.x;
  const dy = goal.y - pose.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return;
  const step = Math.min(WAYPOINT_YD, distance / 2) / distance;
  return `${coord(pose.x + dx * step)}, ${coord(pose.y + dy * step)}`;
}

export function ladderNext(init: {
  ctx: ViewCtx;
  reason: string | undefined;
  recovery: TravelRecovery;
  goal: { x: number | undefined; y: number | undefined };
  ask: string;
}): string {
  const { ctx, reason, recovery, goal, ask } = init;
  if (!LADDER.has(reason ?? "")) return ask;
  if (!recovery.unstuck) return UNSTICK;
  if (recovery.waypointTried) return ask;
  const waypoint = waypointOf(ctx, goal);
  if (!waypoint) return ask;
  recovery.waypoint = waypoint;
  return nextCall("travel", { to: waypoint });
}
