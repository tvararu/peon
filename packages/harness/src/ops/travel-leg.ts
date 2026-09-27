import type { GotoTarget } from "@tuicraft/core";
import { messageOf } from "@tuicraft/core/lib/errors";
import type { LegStatus } from "#harness/contract/details";
import type { OpsCtx } from "#harness/contract/services";
import type { PoseView } from "#harness/contract/views";
import {
  logRouteEnd,
  logRouteReplaced,
  logRouteStart,
} from "#harness/ops/nav-log";
import { distanceTo } from "#harness/ops/range";
import { guidHex } from "#harness/ops/refs";
import { poseView, unitViews } from "#harness/ops/views";
import { awaitGoto, type GotoEnd } from "#harness/runs/adapters";

export type LegGoal =
  | { kind: "unit"; guid: bigint; name: string }
  | { kind: "point"; x: number; y: number; z?: number };

export type LegResult = {
  status: LegStatus;
  reason: string | undefined;
  detail: string;
  floors: number[] | undefined;
  nextStep: string | undefined;
  traveledYd: number;
  floorRetried: boolean;
  pose: PoseView | undefined;
};

export const FLOOR_MATCH_YD = 0.25;
const WITHIN_POLL_MS = 250;
const CODE_WORDS = 3;
const CANCEL_CODES = new Set(["human_stop", "esc", "quit", "stopped_by_tool"]);
const CLASS_PREFIX = /^(?:wait|pick_destination|unreachable|stop): /;
const KNOWN: readonly (readonly [string, string])[] = [
  ["UNKNOWN_HEIGHT", "no_ground"],
  ["ambiguous ground column at destination", "ambiguous_floor"],
  ["not on a ground floor", "ambiguous_floor"],
  ["start snapped off the requested ground position", "start_off_mesh"],
  ["ground corridor changes surface", "surface_change"],
];

export function refusalCode(refusal: string): string {
  const known = KNOWN.find(([text]) => refusal.includes(text));
  if (known) return known[1];
  const words =
    refusal
      .replace(CLASS_PREFIX, "")
      .toLowerCase()
      .match(/[a-z0-9_]+/g) ?? [];
  return words.slice(0, CODE_WORDS).join("_") || "refused";
}

function remainingTo(ctx: OpsCtx, goal: LegGoal): number | undefined {
  if (goal.kind === "unit") return distanceTo(ctx, goal.guid);
  const pose = poseView(ctx);
  return pose ? Math.hypot(pose.x - goal.x, pose.y - goal.y) : undefined;
}

function targetOf(goal: LegGoal): GotoTarget {
  if (goal.kind === "unit") return { guid: goal.guid, kind: "guid" };
  return goal.z === undefined
    ? { kind: "point", x: goal.x, y: goal.y }
    : { kind: "point", x: goal.x, y: goal.y, z: goal.z };
}

function stopOf(signal: AbortSignal): { status: LegStatus; reason: string } {
  const reason = messageOf(signal.reason, "aborted");
  return {
    reason,
    status: CANCEL_CODES.has(reason) ? "cancelled" : "interrupted",
  };
}

function fromEnd(ctx: OpsCtx, end: GotoEnd, near: boolean): LegResult {
  const base = {
    floorRetried: false,
    floors: end.floors,
    nextStep: end.nextStep,
    pose: poseView(ctx),
    traveledYd: end.traveledYd,
  };
  if (end.status === "stopped" && near)
    return { ...base, detail: "arrived", reason: undefined, status: "arrived" };
  if (end.status === "stopped") {
    const stop = stopOf(ctx.signal);
    return { ...base, ...stop, detail: stop.reason };
  }
  const refusal = end.refusal ?? "refused";
  if (end.status === "refused")
    return {
      ...base,
      detail: refusal,
      reason: refusalCode(refusal),
      status: "refused",
    };
  if (end.refusal !== undefined)
    return {
      ...base,
      detail: refusal,
      reason: refusalCode(refusal),
      status: "failed",
    };
  return { ...base, detail: "arrived", reason: undefined, status: "arrived" };
}

async function legOnce(
  ctx: OpsCtx,
  goal: LegGoal,
  within: number,
  announce = true,
): Promise<LegResult> {
  const start = poseView(ctx);
  const before = remainingTo(ctx, goal);
  if (before !== undefined && before <= within)
    return {
      detail: "already in range",
      floorRetried: false,
      floors: undefined,
      nextStep: undefined,
      pose: start,
      reason: undefined,
      status: "arrived",
      traveledYd: 0,
    };
  const near = new AbortController();
  const check = () => {
    const left = remainingTo(ctx, goal);
    if (left !== undefined && left <= within) near.abort(new Error("within"));
  };
  const off = ctx.handle.onControlEvent(check);
  const timer = setInterval(check, WITHIN_POLL_MS);
  if (announce) logRouteStart(ctx, goal);
  try {
    const end = await awaitGoto(ctx.handle, {
      signal: AbortSignal.any([ctx.signal, near.signal]),
      target: targetOf(goal),
    });
    const leg = fromEnd(ctx, end, near.signal.aborted && !ctx.signal.aborted);
    if (leg.status === "arrived" && start) ctx.rt.travel.lastGoodPose = start;
    logRouteEnd(ctx, goal, leg);
    return leg;
  } finally {
    off();
    clearInterval(timer);
  }
}

function matchFloor(
  ctx: OpsCtx,
  guid: bigint,
  floors: readonly number[] | undefined,
) {
  const unit = unitViews(ctx).find((view) => view.guid === guidHex(guid));
  const z = unit?.z;
  if (unit?.x === undefined || unit.y === undefined || z === undefined) return;
  const matches = (floors ?? []).filter(
    (height) => Math.abs(height - z) <= FLOOR_MATCH_YD,
  );
  const [floor] = matches;
  return matches.length === 1 && floor !== undefined
    ? { x: unit.x, y: unit.y, z: floor }
    : undefined;
}

function selfFloor(
  ctx: OpsCtx,
  goal: Extract<LegGoal, { kind: "point" }>,
  floors: readonly number[] | undefined,
) {
  const z = poseView(ctx)?.z;
  if (goal.z !== undefined || z === undefined) return;
  const [floor] = [...(floors ?? [])].sort(
    (a, b) => Math.abs(a - z) - Math.abs(b - z),
  );
  return floor === undefined ? undefined : { x: goal.x, y: goal.y, z: floor };
}

export async function travelLeg(
  ctx: OpsCtx,
  init: { goal: LegGoal; within: number },
): Promise<LegResult> {
  const first = await legOnce(ctx, init.goal, init.within);
  if (first.status !== "refused" || first.reason !== "ambiguous_floor")
    return first;
  const point =
    init.goal.kind === "unit"
      ? matchFloor(ctx, init.goal.guid, first.floors)
      : selfFloor(ctx, init.goal, first.floors);
  if (!point) return first;
  const retry: LegGoal = { kind: "point", ...point };
  logRouteReplaced(ctx, init.goal, retry, first);
  const second = await legOnce(ctx, retry, init.within, false);
  return {
    ...second,
    floorRetried: true,
    traveledYd: first.traveledYd + second.traveledYd,
  };
}
