import { messageOf } from "@tuicraft/core/lib/errors";
import type { TravelAfter } from "#harness/contract/details";
import type { ToolStatus } from "#harness/contract/result";
import type { RunControl, RunEnd, RunStatus } from "#harness/contract/runs";
import type { OpsCtx, ToolCtx } from "#harness/contract/services";
import { dangerView, watchInterrupts } from "#harness/ops/danger";
import { explore, parseDirection } from "#harness/ops/explore";
import { exploreWanted, passedUnits } from "#harness/ops/explore-wanted";
import { distanceTo } from "#harness/ops/range";
import { aliveWhere, recoverOp } from "#harness/ops/recover";
import { Refusal } from "#harness/ops/refusal";
import { notAtLastKnown, seekLastKnown } from "#harness/ops/remembered";
import { resolveUnit, unitRefusal } from "#harness/ops/resolve";
import { travelLeg } from "#harness/ops/travel-leg";
import {
  MIN_UNSTICK_YD,
  UNSTICK_SAMPLE_YD,
  unstick,
} from "#harness/ops/unstick";
import { poseView, selfView, unitViews } from "#harness/ops/views";
import { awaitRun } from "#harness/runs/wait";
import {
  defineGameTool,
  type GameToolSpec,
  result,
  UPDATE_EVERY_MS,
} from "#harness/tools/define";
import { askHuman, nextCall } from "#harness/tools/next-call";
import { type TravelArgs, travelParams } from "#harness/tools/params";
import {
  exploreReport,
  type Goal,
  goalName,
  goalView,
  interruptReport,
  legReport,
  type Report,
  secs,
  stopReport,
  yd,
  youLine,
} from "#harness/tools/travel-report";

type After = (patch: Partial<TravelAfter>) => TravelAfter;
type Work = { ops: OpsCtx; args: TravelArgs; goal: Goal; after: After };

const COORDS =
  /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*(?:,\s*(-?\d+(?:\.\d+)?)\s*)?$/;
const RUN_STATUS: Record<ToolStatus, Exclude<RunStatus, "running">> = {
  DONE: "succeeded",
  FAILED: "failed",
  PARTLY: "partly",
  REFUSED: "failed",
  RUNNING: "succeeded",
  UNCONFIRMED: "failed",
};
const HUMAN_WROTE = "The human wrote a message. Read it before you act.";

function parseExplore(text: string, lower: string): Goal {
  const direction = parseDirection(lower);
  if (lower !== "explore" && !direction)
    throw new Refusal({
      detail: `"${text}" is not a direction.`,
      next: nextCall("travel", { to: "explore north" }),
      reason: "bad_direction",
    });
  return { direction, kind: "explore" };
}

function parseGoal(ctx: ToolCtx<TravelAfter>, to: string): Goal {
  const text = to.trim();
  const lower = text.toLowerCase();
  if (lower === "corpse") return { kind: "corpse" };
  if (lower === "unstick") return { kind: "unstick" };
  if (lower === "explore" || lower.startsWith("explore "))
    return parseExplore(text, lower);
  const coords = COORDS.exec(text);
  if (coords)
    return {
      kind: "point",
      x: Number(coords[1]),
      y: Number(coords[2]),
      z: coords[3] === undefined ? undefined : Number(coords[3]),
    };
  const resolved = resolveUnit(ctx, { text });
  if (resolved.kind !== "unit")
    throw unitRefusal({ param: "to", resolved, tool: "travel" });
  return { guid: resolved.guid, kind: "unit", unit: resolved.unit };
}

function remainingOf(ctx: OpsCtx, goal: Goal): number | undefined {
  if (goal.kind === "unit") return distanceTo(ctx, goal.guid);
  const pose = poseView(ctx);
  return goal.kind === "point" && pose
    ? Math.hypot(pose.x - goal.x, pose.y - goal.y)
    : undefined;
}

type UnitGoal = Extract<Goal, { kind: "unit" }>;

async function legWork(
  work: Work & { goal: Extract<Goal, { kind: "unit" | "point" }> },
  walkedYd = 0,
): Promise<Report> {
  const { ops, args, goal, after } = work;
  const walked = await travelLeg(ops, {
    goal:
      goal.kind === "unit"
        ? { guid: goal.guid, kind: "unit", name: goal.unit.name }
        : {
            kind: "point",
            x: goal.x,
            y: goal.y,
            ...(goal.z === undefined ? {} : { z: goal.z }),
          },
    within: args.within ?? (goal.kind === "unit" ? 3 : 1),
  });
  const leg = { ...walked, traveledYd: walked.traveledYd + walkedYd };
  const view = after({
    floorRetried: leg.floorRetried,
    floors: leg.floors,
    legs: [
      {
        index: 0,
        reason: leg.reason,
        status: leg.status,
        traveledYd: leg.traveledYd,
      },
    ],
    remainingYd: remainingOf(ops, goal),
    traveledYd: leg.traveledYd,
  });
  return legReport({ after: view, ctx: ops, goal, leg, to: args.to });
}

async function rememberedWork(
  work: Work & { goal: UnitGoal },
): Promise<Report> {
  const { ops, args, goal, after } = work;
  const { found, leg } = await seekLastKnown(ops, goal.unit);
  if (found)
    return legWork(
      { ...work, goal: { ...goal, guid: found.guid, unit: found.unit } },
      leg?.traveledYd,
    );
  const view = after({ traveledYd: leg?.traveledYd ?? 0 });
  if (leg && leg.status !== "arrived")
    return legReport({ after: view, ctx: ops, goal, leg, to: args.to });
  const refusal = notAtLastKnown(ops, goal.unit);
  return result("FAILED", {
    after: view,
    detail: refusal.detail,
    next: refusal.next,
    reason: refusal.reason,
  });
}

async function unstickWork(work: Work): Promise<Report> {
  try {
    const moved = await unstick(work.ops);
    if (moved.movedYd < MIN_UNSTICK_YD)
      return result("FAILED", {
        after: work.after({ traveledYd: moved.movedYd }),
        detail: `moved ${yd(moved.movedYd)} yd; no way to open ground within ${UNSTICK_SAMPLE_YD} yd planned or walked from here.`,
        next: askHuman("I am stuck. Can you move me?"),
        reason: "stuck",
      });
    return result("DONE", {
      after: work.after({
        goal: { kind: "unstick", refusedGoal: moved.refusedGoal },
        traveledYd: moved.movedYd,
      }),
      detail: `moved ${yd(moved.movedYd)} yd.`,
      next: moved.refusedGoal
        ? nextCall("travel", { to: moved.refusedGoal })
        : nextCall("look"),
    });
  } catch (error) {
    return result("FAILED", {
      after: work.after({}),
      detail: messageOf(error),
      next: askHuman("I am stuck. Can you move me?"),
      reason: "unstick_failed",
    });
  }
}

async function corpseWork(work: Work): Promise<Report> {
  const recovered = await recoverOp(work.ops, "corpse");
  const view = work.after({ legs: [], remainingYd: recovered.corpseYd });
  if (recovered.outcome.ok)
    return result("DONE", {
      after: view,
      detail: `alive again ${aliveWhere(recovered.corpseYd, undefined)} after ${secs(view.elapsedMs)} s. ${youLine(work.ops)}`,
    });
  const healer = recovered.alternatives.some((text) =>
    text.startsWith("spirit healer"),
  );
  return result("FAILED", {
    after: view,
    body: [`Other ways: ${recovered.alternatives.join(". ")}.`],
    detail: `could not get back to your corpse (${recovered.outcome.cause}).`,
    next: healer
      ? nextCall("recover", { how: "spirit_healer" })
      : askHuman("I cannot reach my corpse. What should I do?"),
    reason: recovered.outcome.cause,
  });
}

async function doWork(work: Work): Promise<Report> {
  const { goal } = work;
  if (goal.kind === "unit" && !goal.unit.inView)
    return rememberedWork({ ...work, goal });
  if (goal.kind === "unit" || goal.kind === "point")
    return legWork({ ...work, goal });
  if (goal.kind === "unstick") return unstickWork(work);
  if (goal.kind === "corpse") return corpseWork(work);
  const wanted = exploreWanted(work.ops, work.args.for);
  const found = await explore(work.ops, { direction: goal.direction, wanted });
  return exploreReport(
    { ...found, passed: passedUnits(work.ops, found.newInView, wanted) },
    work.after({
      legs: found.legs,
      newInView: found.newInView,
      traveledYd: found.walkedYd,
    }),
  );
}

function runStatus(
  value: Report,
  stop: string | undefined,
): Exclude<RunStatus, "running"> {
  if (stop === "connection_lost") return "interrupted";
  if (stop !== undefined) return "cancelled";
  if (value.reason === "interrupted" || value.reason === "died")
    return "interrupted";
  return RUN_STATUS[value.status];
}

function runEnd(value: Report, stop?: string): RunEnd<Report> {
  return {
    reason: stop ?? value.reason,
    status: runStatus(value, stop),
    summary: `${value.status} ${value.detail}`,
    value,
  };
}

function afterOf(ops: OpsCtx, goal: Goal): After {
  const startedAt = ops.rt.clock.now();
  const start = poseView(ops);
  const seen = new Set(unitViews(ops).map((unit) => unit.guid));
  const totalYd = remainingOf(ops, goal);
  return (patch) => {
    const pose = poseView(ops);
    return {
      elapsedMs: ops.rt.clock.now() - startedAt,
      floorRetried: false,
      floors: undefined,
      goal: goalView(goal),
      legs: [],
      newInView: unitViews(ops).filter((unit) => !seen.has(unit.guid)),
      pose,
      remainingYd: remainingOf(ops, goal),
      totalYd,
      traveledYd:
        start && pose ? Math.hypot(pose.x - start.x, pose.y - start.y) : 0,
      ...patch,
    };
  };
}

async function launch(init: {
  ctx: ToolCtx<TravelAfter>;
  args: TravelArgs;
  goal: Goal;
  control: RunControl;
  partial: (after: TravelAfter) => void;
}): Promise<RunEnd<Report>> {
  const { ctx, args, goal, control, partial } = init;
  const rules = { death: true, newAttacker: true, rooted: true };
  const watch = watchInterrupts(
    { ...ctx, progress: control.progress, signal: control.signal },
    rules,
  );
  const ops: OpsCtx = {
    ...ctx,
    progress: control.progress,
    signal: AbortSignal.any([control.signal, watch.signal]),
  };
  const after = afterOf(ops, goal);
  const tick = setInterval(() => {
    const now = after({});
    control.progress(`${yd(now.traveledYd)} yd walked`);
    partial(now);
  }, UPDATE_EVERY_MS);
  try {
    const report = await doWork({ after, args, goal, ops });
    if (control.signal.aborted)
      return runEnd(
        stopReport(control.signal, report.after),
        messageOf(control.signal.reason),
      );
    const cause = watch.cause();
    return runEnd(cause ? interruptReport(ctx, cause, report.after) : report);
  } finally {
    clearInterval(tick);
    watch.dispose();
  }
}

function emptyTravel(): TravelAfter {
  return {
    elapsedMs: 0,
    floorRetried: false,
    floors: undefined,
    goal: { direction: undefined, kind: "explore" },
    legs: [],
    newInView: [],
    pose: undefined,
    remainingYd: undefined,
    totalYd: undefined,
    traveledYd: 0,
  };
}

function refuseUnderAttack(ctx: ToolCtx<TravelAfter>): void {
  const [attacker] = dangerView(ctx).attackers;
  if (!attacker) return;
  throw new Refusal({
    detail: `${attacker.name} ${attacker.ref} is attacking you.`,
    next: nextCall("engage", { target: attacker.ref }),
    reason: "attacked",
  });
}

async function runTravel(
  args: TravelArgs,
  ctx: ToolCtx<TravelAfter>,
): Promise<Report> {
  const goal = parseGoal(ctx, args.to);
  refuseUnderAttack(ctx);
  if (goal.kind === "corpse" && selfView(ctx).life === "alive")
    throw new Refusal({
      detail: "you are alive; there is no corpse to reach.",
      next: nextCall("look"),
      reason: "alive",
    });
  let runId = "";
  let latest = emptyTravel();
  const partial = (after: TravelAfter) => {
    latest = after;
    const detail = `travel to ${goalName(goal)}, ${yd(after.traveledYd)} yd walked.`;
    ctx.update(result("RUNNING", { after, detail, runId }));
  };
  const run = ctx.rt.runs.start<Report>({
    args,
    kind: "travel",
    launch: (control) => launch({ args, control, ctx, goal, partial }),
    toolCallId: ctx.toolCallId,
  });
  runId = run.id;
  const waited = await awaitRun({ rt: ctx.rt, run });
  if (waited.kind === "ended") return { ...waited.end.value, runId };
  const togo =
    latest.remainingYd === undefined
      ? ""
      : `, ${yd(latest.remainingYd)} yd to go`;
  return result("RUNNING", {
    after: latest,
    body: waited.why === "human" ? [HUMAN_WROTE] : [],
    detail: `travel to ${goalName(goal)}, ${yd(latest.traveledYd)} yd walked${togo}. ${youLine(ctx)}`,
    next: `end your turn; a [game] message comes when ${runId} ends. Or ${nextCall("stop", { run: runId })}.`,
    runId,
  });
}

export const travelSpec: GameToolSpec<typeof travelParams, "travel"> = {
  fallback: emptyTravel,
  kind: "run",
  name: "travel",
  parameters: travelParams,
  run: runTravel,
};

export const travelTool = defineGameTool(travelSpec);
