import { messageOf } from "@tuicraft/core/lib/errors";
import type { TravelAfter, TravelGoalView } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { OpsCtx, ViewCtx } from "#harness/contract/services";
import type { Compass, UnitView } from "#harness/contract/views";
import type { InterruptCause } from "#harness/ops/danger";
import type { ExploreResult } from "#harness/ops/explore";
import { FLOOR_MATCH_YD, type LegResult } from "#harness/ops/travel-leg";
import { structuralAsk, structuralReach } from "#harness/ops/unreached";
import { poseView, vitalsView } from "#harness/ops/views";
import { askHuman, nextCall, result } from "#harness/tools/define";

export type Goal =
  | { kind: "unit"; guid: bigint; unit: UnitView }
  | { kind: "point"; x: number; y: number; z: number | undefined }
  | { kind: "corpse" }
  | { kind: "explore"; direction: Compass | undefined }
  | { kind: "unstick" };

export type Report = ToolResult<TravelAfter>;

const WORD: Record<Compass, string> = {
  E: "east",
  N: "north",
  NE: "northeast",
  NW: "northwest",
  S: "south",
  SE: "southeast",
  SW: "southwest",
  W: "west",
};
const GROUPS: readonly (readonly [string, (unit: UnitView) => boolean])[] = [
  ["hostile", (unit) => unit.attackable && unit.relation === "hostile"],
  ["neutral", (unit) => unit.attackable && unit.relation === "neutral"],
  ["questgiver", (unit) => unit.roles.includes("questgiver")],
  ["vendor", (unit) => unit.roles.some((role) => role.startsWith("vendor"))],
  ["player", (unit) => unit.kind === "player"],
];

const CLASS_PREFIX = /^(?:wait|pick_destination|unreachable|stop): /;
const NOT_TRIED_HERE = `Not tried: ${nextCall("travel", { to: "unstick" })}, another route.`;
const NOT_TRIED_THERE = "Not tried: another destination.";
const NO_MAP_DATA =
  "This map has no navigation data, so no travel can work here.";
const DESTINATION_SIDE = [
  "UNKNOWN_PATH",
  "end snapped off",
  "native path omits destination",
  "ambiguous ground column at destination",
  "destination is not on a ground floor",
];
const PLAIN: readonly (readonly [string, string, string])[] = [
  [
    "UNKNOWN_PATH",
    "no_path",
    "no route on the navigation mesh reaches the destination (UNKNOWN_PATH)",
  ],
];

function plainStep(step: string): string {
  return step
    .replace("Inspect navigation.replan and choose", "Choose")
    .replaceAll("goto", "travel");
}

function sentence(text: string): string {
  const trimmed = text.replace(CLASS_PREFIX, "").trim();
  return trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
}

function coord(n: number): string {
  return String(Math.round(n * 10) / 10);
}

function byNearest(floors: readonly number[], z: number | undefined): number[] {
  if (z === undefined) return [...floors];
  return [...floors].sort((a, b) => Math.abs(a - z) - Math.abs(b - z));
}

function nearestFloor(
  floors: readonly number[],
  z: number | undefined,
): number | undefined {
  return byNearest(floors, z)[0];
}

function unitFloorsReport(
  goal: Extract<Goal, { kind: "unit" }>,
  leg: LegResult,
  after: TravelAfter,
  tried: string,
): Report | undefined {
  const floors = leg.floors ?? [];
  const { x, y, z } = goal.unit;
  const floor = nearestFloor(floors, z);
  if (x === undefined || y === undefined || floor === undefined) return;
  const at = z === undefined ? "" : ` ${z.toFixed(1)}`;
  const height = `none is within ${FLOOR_MATCH_YD} yd of ${goal.unit.name}'s height${at}`;
  return result("REFUSED", {
    after,
    detail: `the ground at ${goalName(goal)} has ${floors.length} floors: ${floors.map((one) => one.toFixed(1)).join(", ")}, and ${height}. ${tried} ${NOT_TRIED_THERE}`,
    next: nextCall("travel", {
      to: `${coord(x)}, ${coord(y)}, ${floor.toFixed(1)}`,
    }),
    options: floors,
    reason: "ambiguous_floor",
  });
}

export function yd(n: number): string {
  if (n === 0) return "0";
  return n < 10 ? n.toFixed(1) : Math.round(n).toString();
}

export function secs(ms: number): string {
  return (ms / 1000).toFixed(1);
}

export function goalView(goal: Goal): TravelGoalView {
  if (goal.kind === "unit")
    return { kind: "unit", name: goal.unit.name, ref: goal.unit.ref };
  if (goal.kind === "point")
    return { kind: "point", x: goal.x, y: goal.y, z: goal.z };
  if (goal.kind === "explore")
    return { direction: goal.direction, kind: "explore" };
  if (goal.kind === "unstick")
    return { kind: "unstick", refusedGoal: undefined };
  return { kind: "corpse" };
}

export function goalName(goal: Goal): string {
  if (goal.kind === "unit") return `${goal.unit.name} (${goal.unit.ref})`;
  if (goal.kind === "point") return `${goal.x}, ${goal.y}`;
  return goal.kind;
}

export function youLine(ctx: ViewCtx): string {
  const vitals = vitalsView(ctx);
  const pose = poseView(ctx);
  const mana =
    vitals.powerKind === "mana" && vitals.maxPower > 0
      ? `, mana ${Math.round((vitals.power / vitals.maxPower) * 100)}%`
      : "";
  const at = pose ? `, at ${Math.round(pose.x)}, ${Math.round(pose.y)}` : "";
  return `You: HP ${vitals.hp}/${vitals.maxHp}${mana}${at}.`;
}

function unitBrief(unit: UnitView): string {
  return `${unit.ref} ${unit.name} L${unit.level} ${yd(unit.distance ?? 0)} yd ${unit.compass ?? ""}`.trim();
}

export function newInViewText(units: readonly UnitView[]): string {
  const sorted = [...units].sort(
    (a, b) => (a.distance ?? 0) - (b.distance ?? 0),
  );
  const parts = GROUPS.flatMap(([label, test]) => {
    const hits = sorted.filter(test);
    const [first] = hits;
    if (!first) return [];
    const one = `1 ${label} (${unitBrief(first)})`;
    return [
      hits.length === 1
        ? one
        : `${hits.length} ${label} (nearest ${unitBrief(first)})`,
    ];
  });
  return parts.length === 0
    ? "Nothing new in view."
    : `New in view: ${parts.join(", ")}.`;
}

function otherRefusal(
  leg: LegResult,
  after: TravelAfter,
  done: string,
  ask: string,
): Report {
  const plain = PLAIN.find(([text]) => leg.detail.includes(text));
  const notTried = DESTINATION_SIDE.some((text) => leg.detail.includes(text))
    ? NOT_TRIED_THERE
    : NOT_TRIED_HERE;
  return result("FAILED", {
    after,
    body: leg.nextStep ? [plainStep(leg.nextStep)] : [],
    detail: `${plain?.[2] ?? sentence(leg.detail)}. ${done} ${notTried}`,
    next: ask,
    reason: plain?.[1] ?? leg.reason ?? "failed",
  });
}

function pointFloorsReport(init: {
  ctx: ViewCtx;
  goal: Extract<Goal, { kind: "point" }>;
  leg: LegResult;
  after: TravelAfter;
  tried: string;
}): Report {
  const { ctx, goal, leg, after, tried } = init;
  const floors = leg.floors ?? [];
  const byHeight = byNearest(floors, poseView(ctx)?.z);
  const offer = (leg.floorRetried ? byHeight[1] : undefined) ?? byHeight[0];
  const retried = leg.floorRetried ? ` ${tried}` : "";
  return result("REFUSED", {
    after,
    detail: `the ground at ${goalName(goal)} has ${floors.length} floors: ${floors.map((floor) => floor.toFixed(1)).join(", ")}.${retried}`,
    next: nextCall("travel", {
      to: `${goal.x}, ${goal.y}, ${offer?.toFixed(1) ?? ""}`,
    }),
    options: floors,
    reason: "ambiguous_floor",
  });
}

function refusedReport(init: {
  ctx: ViewCtx;
  goal: Goal;
  leg: LegResult;
  after: TravelAfter;
}): Report {
  const { ctx, goal, leg, after } = init;
  const name = goalName(goal);
  const walked = `Walked ${yd(leg.traveledYd)} yd.`;
  const tried = `Tried: ${leg.floorRetried ? "planner twice (floor retry)" : "planner once"}.`;
  const ask = askHuman(
    `I cannot reach ${goal.kind === "unit" ? goal.unit.name : name} from here. Is there another way?`,
  );
  if (leg.reason === "ambiguous_floor" && goal.kind === "point")
    return pointFloorsReport({ after, ctx, goal, leg, tried });
  if (leg.reason === "ambiguous_floor" && goal.kind === "unit") {
    const floors = unitFloorsReport(goal, leg, after, tried);
    if (floors) return floors;
  }
  if (leg.reason === "start_off_mesh")
    return result("FAILED", {
      after,
      detail: `your own position is not on ground the planner knows (start snapped off). ${walked}`,
      next: nextCall("travel", { to: "unstick" }),
      reason: "start_off_mesh",
    });
  if (leg.reason === "no_ground")
    return result("FAILED", {
      after,
      detail: `the path finder found no ground on the way (UNKNOWN_HEIGHT). ${walked} ${tried}`,
      next: ask,
      reason: "no_ground",
    });
  if (structuralReach(leg) === "unsupported_map")
    return result("FAILED", {
      after,
      detail: `${sentence(leg.detail)}. ${walked} ${tried} ${NO_MAP_DATA}`,
      next: structuralAsk(
        "unsupported_map",
        goal.kind === "unit" ? goal.unit.name : name,
      ),
      reason: leg.reason ?? "unsupported_map",
    });
  return otherRefusal(leg, after, `${walked} ${tried}`, ask);
}

export function legReport(init: {
  ctx: OpsCtx;
  to: string;
  goal: Goal;
  leg: LegResult;
  after: TravelAfter;
}): Report {
  const { ctx, to, goal, leg, after } = init;
  if (leg.status === "arrived") {
    const away =
      after.remainingYd === undefined
        ? ""
        : `${yd(after.remainingYd)} yd away `;
    return result("DONE", {
      after,
      detail: `arrived at ${goalName(goal)}: ${away}after ${yd(leg.traveledYd)} yd in ${secs(after.elapsedMs)} s.`,
    });
  }
  if (leg.status === "cancelled" || leg.status === "interrupted")
    return result("FAILED", {
      after,
      detail: `${leg.detail}. Walked ${yd(leg.traveledYd)} yd.`,
      next: nextCall("look"),
      reason: "interrupted",
    });
  ctx.rt.travel.lastRefusedGoal = to;
  return refusedReport({ after, ctx, goal, leg });
}

function stuckAtStart(found: ExploreResult): string | undefined {
  const reasons = new Set(found.legs.map((leg) => leg.reason));
  const [reason] = reasons;
  if (found.walkedYd > 0 || reasons.size !== 1 || reason === undefined) return;
  return reason;
}

function obstructedReport(found: ExploreResult, after: TravelAfter): Report {
  const where = `${yd(found.walkedYd)} yd ${WORD[found.direction]}`;
  const seen = newInViewText(found.newInView);
  const blocked = `explored ${where}; ${found.obstructed} legs were blocked`;
  const stuck = stuckAtStart(found);
  const kind =
    stuck === undefined
      ? undefined
      : structuralReach({ detail: "", reason: stuck });
  if (kind === "unsupported_map")
    return result("PARTLY", {
      after,
      detail: `${blocked}. ${NO_MAP_DATA} ${seen}`,
      next: structuralAsk(kind),
      reason: "obstructed",
    });
  if (stuck !== undefined)
    return result("PARTLY", {
      after,
      detail: `${blocked}, each by the same fault where you stand (${stuck}). ${seen}`,
      next: nextCall("travel", { to: "unstick" }),
      reason: "obstructed",
    });
  return result("PARTLY", {
    after,
    detail: `${blocked}. ${seen}`,
    next: nextCall("travel", { to: "explore" }),
    reason: "obstructed",
  });
}

export function exploreReport(
  found: ExploreResult,
  after: TravelAfter,
): Report {
  const where = `${yd(found.walkedYd)} yd ${WORD[found.direction]}`;
  const seen = newInViewText(found.newInView);
  if (found.stoppedBy === "obstructed") return obstructedReport(found, after);
  return result("DONE", { after, detail: `explored ${where}. ${seen}` });
}

export function stopReport(signal: AbortSignal, after: TravelAfter): Report {
  const code = messageOf(signal.reason, "cancelled");
  if (code === "human_stop" || code === "esc")
    return result("FAILED", {
      after,
      detail: "the human stopped you. Start nothing new.",
      next: "end your turn and wait for the human.",
      reason: "cancelled",
    });
  if (code === "connection_lost")
    return result("FAILED", {
      after,
      detail: "the game connection was lost.",
      next: "ask the human to run /connect.",
      reason: "interrupted",
    });
  return result("FAILED", {
    after,
    detail: `the run was stopped (${code}).`,
    next: nextCall("look"),
    reason: "cancelled",
  });
}

export function interruptReport(
  ctx: ViewCtx,
  cause: InterruptCause,
  after: TravelAfter,
): Report {
  if (cause.code === "died")
    return result("FAILED", {
      after,
      detail: "you died on the way.",
      next: nextCall("recover"),
      reason: "died",
    });
  const ref =
    cause.attacker === undefined
      ? undefined
      : ctx.rt.refs.refOf(cause.attacker);
  return result("FAILED", {
    after,
    detail: `${cause.detail} Walked ${yd(after.traveledYd)} yd.`,
    next: ref ? nextCall("engage", { target: ref }) : nextCall("look"),
    reason: "interrupted",
  });
}
