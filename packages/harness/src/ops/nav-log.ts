import type { LogEvent } from "#harness/contract/log";
import type { OpsCtx } from "#harness/contract/services";
import { guidHex } from "#harness/ops/refs";
import type { LegGoal, LegResult } from "#harness/ops/travel-leg";

type RouteRow = {
  event: LogEvent;
  goal: LegGoal;
  status: string;
  reason?: string | undefined;
  floors?: number[] | undefined;
  nextStep?: string | undefined;
  traveledYd: number;
  text: string;
};

function coord(n: number): string {
  return String(Math.round(n * 10) / 10);
}

export function goalLabel(goal: LegGoal): string {
  if (goal.kind === "unit") return goal.name;
  const at = [goal.x, goal.y, ...(goal.z === undefined ? [] : [goal.z])];
  return at.map(coord).join(", ");
}

function append(ctx: OpsCtx, row: RouteRow): void {
  const runId = ctx.rt.runs.active()?.id;
  ctx.rt.log.append({
    class: "log",
    data: {
      floors: row.floors,
      goal: goalLabel(row.goal),
      nextStep: row.nextStep,
      reason: row.reason,
      runId,
      status: row.status,
      traveledYd: Math.round(row.traveledYd * 10) / 10,
    },
    domain: "nav",
    event: row.event,
    ...(row.goal.kind === "unit" ? { guid: guidHex(row.goal.guid) } : {}),
    ...(runId === undefined ? {} : { runId }),
    text: row.text,
  });
}

export function logRouteStart(ctx: OpsCtx, goal: LegGoal): void {
  append(ctx, {
    event: "nav/route_start",
    goal,
    status: "started",
    text: `Route to ${goalLabel(goal)} started.`,
    traveledYd: 0,
  });
}

export function logRouteReplaced(
  ctx: OpsCtx,
  from: LegGoal,
  to: LegGoal,
  first: LegResult,
): void {
  append(ctx, {
    event: "nav/route_replaced",
    floors: first.floors,
    goal: to,
    reason: "floor_retry",
    status: "replaced",
    text: `Route to ${goalLabel(from)} replaced by ${goalLabel(to)} (floor_retry).`,
    traveledYd: first.traveledYd,
  });
}

export function logRouteNudged(
  ctx: OpsCtx,
  goal: LegGoal,
  movedYd: number,
): void {
  append(ctx, {
    event: "nav/route_replaced",
    goal,
    reason: "off_mesh_nudge",
    status: "replaced",
    text: `Route to ${goalLabel(goal)} nudged ${Math.round(movedYd * 10) / 10} yd onto the mesh (off_mesh_nudge).`,
    traveledYd: movedYd,
  });
}

export function logRouteEnd(ctx: OpsCtx, goal: LegGoal, leg: LegResult): void {
  const label = goalLabel(goal);
  const walked = Math.round(leg.traveledYd);
  const why = leg.reason === undefined ? "" : ` (${leg.reason})`;
  const refused = leg.status === "refused";
  append(ctx, {
    event: refused ? "nav/refused" : "nav/route_end",
    floors: leg.floors,
    goal,
    nextStep: leg.nextStep,
    reason: leg.reason,
    status: leg.status,
    text: refused
      ? `Route to ${label} refused${why}.`
      : `Route to ${label} ended: ${leg.status}${why} after ${walked} yd.`,
    traveledYd: leg.traveledYd,
  });
}
