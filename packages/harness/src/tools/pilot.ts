import { messageOf } from "@peon/core/lib/errors";
import type {
  PilotAfter,
  PilotDecisionView,
  PilotGoalView,
} from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { RunControl, RunEnd, RunStatus } from "#harness/contract/runs";
import type { OpsCtx, ToolCtx, ViewCtx } from "#harness/contract/services";
import type { PilotObjective } from "#harness/loops/pilot-types";
import { type InterruptWatch, watchInterrupts } from "#harness/ops/danger";
import { Refusal } from "#harness/ops/refusal";
import { manaText, poseView, vitalsView } from "#harness/ops/views";
import { awaitPilot } from "#harness/runs/adapters";
import { awaitRun } from "#harness/runs/wait";
import { defineGameTool, result } from "#harness/tools/define";
import type { GameToolSpec } from "#harness/tools/game-tool";
import { askHuman, nextCall } from "#harness/tools/next-call";
import { type PilotArgs, pilotParams } from "#harness/tools/params-pilot";
import { pilotRenderers } from "#harness/ui/renderers/live-run";

type Report = ToolResult<PilotAfter>;
type Latest = { after: PilotAfter };

const HUMAN_WROTE = "The human wrote a message. Read it before you act.";
const NO_MAP_DATA =
  "This map has no navigation data, so no travel can work here.";
const DECISION_LOG_KEPT = 20;

type SteerTally = {
  decisions: number;
  jumps: number;
  pathYd: number;
  log: PilotDecisionView[];
  last: { x: number; y: number } | undefined;
};

function goalView(objective: PilotObjective): PilotGoalView {
  if (objective.kind === "reach")
    return { kind: "reach", x: objective.x, y: objective.y };
  return {
    direction: objective.direction,
    kind: "circle",
    radius: objective.radius,
    x: objective.x,
    y: objective.y,
  };
}

function goalText(objective: PilotObjective): string {
  if (objective.kind === "reach") return `(${objective.x}, ${objective.y})`;
  return `circle (${objective.x}, ${objective.y}) r${objective.radius} ${objective.direction}`;
}

function pilotRunArgs(objective: PilotObjective): Record<string, unknown> {
  if (objective.kind === "reach")
    return { to: `${objective.x},${objective.y}` };
  return {
    circle: `${objective.x},${objective.y} r${objective.radius} ${objective.direction}`,
  };
}

export function emptyPilot(objective?: PilotObjective): PilotAfter {
  return {
    calls: 0,
    decisionLog: [],
    decisions: 0,
    elapsedMs: 0,
    finalYd: undefined,
    goal: objective ? goalView(objective) : { kind: "reach", x: 0, y: 0 },
    jumps: 0,
    pose: undefined,
    timeouts: 0,
    walkedYd: 0,
  };
}

function youLine(ctx: ViewCtx): string {
  const vitals = vitalsView(ctx);
  const pose = poseView(ctx);
  const mana = manaText(vitals);
  return `You: HP ${vitals.hp}/${vitals.maxHp}${mana ? `, ${mana}` : ""}${pose ? `, at ${Math.round(pose.x)}, ${Math.round(pose.y)}` : ""}.`;
}

export function pilotObjective(args: PilotArgs): PilotObjective {
  const hasTo = args.to !== undefined;
  const hasCircle = args.circle !== undefined;
  if (hasTo === hasCircle)
    throw new Refusal({
      detail: "give exactly one of to or circle.",
      next: 'pilot(to: { x: 10, y: 0 }) or pilot(circle: { x: 0, y: 0, radius: 10, direction: "clockwise" })',
      reason: "bad_objective",
    });
  if (args.to) return { kind: "reach", x: args.to.x, y: args.to.y };
  const circle = args.circle;
  if (!circle)
    throw new Refusal({
      detail: "give exactly one of to or circle.",
      next: "pilot(to: { x: 10, y: 0 })",
      reason: "bad_objective",
    });
  return {
    direction: circle.direction,
    kind: "circle",
    radius: circle.radius,
    x: circle.x,
    y: circle.y,
  };
}

function checkReady(ctx: ToolCtx<PilotAfter>): void {
  const capabilities = ctx.handle.capabilities();
  if (!capabilities.jev)
    throw new Refusal({
      detail: "TYPESAFE_API_KEY is not set.",
      next: "ask the human to set it.",
      reason: "no_combat_helper",
    });
  if (!capabilities.navigation)
    throw new Refusal({
      detail: NO_MAP_DATA,
      next: askHuman("This map has no navigation data. Can you move me?"),
      reason: "unsupported_map",
    });
  const life = ctx.handle.getRecoveryState().life;
  if (life === "dead" || life === "ghost")
    throw new Refusal({
      detail: "you are dead.",
      next: nextCall("recover"),
      reason: "dead",
    });
}

function steerTally(ops: OpsCtx): SteerTally {
  const start = poseView(ops);
  return {
    decisions: 0,
    jumps: 0,
    last: start ? { x: start.x, y: start.y } : undefined,
    log: [],
    pathYd: 0,
  };
}

function trackApplied(
  ops: OpsCtx,
  tally: SteerTally,
  event: { actionId: string; call: number },
): void {
  tally.decisions += 1;
  if (event.actionId === "jump_ahead") tally.jumps += 1;
  tally.log.push({
    actionId: event.actionId,
    at: ops.rt.clock.now(),
    call: event.call,
    disposition: "applied",
  });
  if (tally.log.length > DECISION_LOG_KEPT) tally.log.shift();
  const pose = poseView(ops);
  if (pose && tally.last)
    tally.pathYd += Math.hypot(pose.x - tally.last.x, pose.y - tally.last.y);
  if (pose) tally.last = { x: pose.x, y: pose.y };
}

function afterOf(
  ops: OpsCtx,
  objective: PilotObjective,
  tally: SteerTally,
): () => PilotAfter {
  const startedAt = ops.rt.clock.now();
  return () => {
    const pose = poseView(ops);
    return {
      calls: tally.decisions,
      decisionLog: [...tally.log],
      decisions: tally.decisions,
      elapsedMs: ops.rt.clock.now() - startedAt,
      finalYd:
        objective.kind === "reach" && pose
          ? Math.hypot(objective.x - pose.x, objective.y - pose.y)
          : undefined,
      goal: goalView(objective),
      jumps: tally.jumps,
      pose,
      timeouts: ops.handle.getPilotState().timeouts.total,
      walkedYd: tally.pathYd,
    };
  };
}

function stopReport(signal: AbortSignal, after: PilotAfter): Report {
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
    detail: `the pilot run was stopped (${code}).`,
    next: nextCall("look"),
    reason: "cancelled",
  });
}

function runStatus(
  report: Report,
  stop: string | undefined,
): Exclude<RunStatus, "running"> {
  if (stop === "connection_lost") return "interrupted";
  if (stop !== undefined) return "cancelled";
  if (report.reason === "interrupted" || report.reason === "died")
    return "interrupted";
  if (report.status === "DONE") return "succeeded";
  return report.status === "PARTLY" ? "partly" : "failed";
}

function runEnd(report: Report, stop?: string): RunEnd<Report> {
  return {
    reason: stop ?? report.reason,
    status: runStatus(report, stop),
    summary: `${report.status} ${report.detail}`,
    value: report,
  };
}

function refusalReport(refusal: Refusal, after: PilotAfter): Report {
  return result(refusal.status, {
    after,
    body: refusal.body,
    detail: refusal.detail,
    next: refusal.next,
    options: refusal.options,
    reason: refusal.reason,
  });
}

function detailOf(objective: PilotObjective, after: PilotAfter): string {
  const walked =
    after.walkedYd < 10
      ? after.walkedYd.toFixed(1)
      : String(Math.round(after.walkedYd));
  const head =
    objective.kind === "reach"
      ? `steered to ${goalText(objective)}, ${after.decisions} decisions, ${after.jumps} jumps, walked ${walked} yd`
      : `steered ${goalText(objective)}, ${after.decisions} decisions, ${after.jumps} jumps, walked ${walked} yd`;
  return head;
}

function outcomeReport(
  objective: PilotObjective,
  after: PilotAfter,
  end: {
    outcome: { status: string; reason: string } | undefined;
    error: string | undefined;
  },
): Report {
  const { error, outcome } = end;
  const reason = outcome?.reason ?? error ?? "stopped";
  if (outcome?.status === "completed") {
    const walked =
      after.walkedYd < 10
        ? after.walkedYd.toFixed(1)
        : String(Math.round(after.walkedYd));
    const arrived =
      objective.kind === "reach" && after.finalYd !== undefined
        ? `arrived within ${after.finalYd.toFixed(1)} yd of ${goalText(objective)}`
        : `finished one lap of ${goalText(objective)}`;
    return result("DONE", {
      after,
      detail: `${arrived} after ${after.decisions} decisions, ${after.jumps} jumps, walked ${walked} yd.`,
      next: nextCall("look"),
    });
  }
  if (reason === "self_dead" || reason === "died")
    return result("FAILED", {
      after,
      detail: `you died while steering to ${goalText(objective)}.`,
      next: nextCall("recover"),
      reason: "died",
    });
  if (reason.startsWith("jev_unavailable") || reason === "jev_timeout")
    return result("FAILED", {
      after,
      detail: `the fight helper stopped answering (${reason}).`,
      next: askHuman("The fight helper stopped answering. What should I do?"),
      reason: "jev_unavailable",
    });
  return result("FAILED", {
    after,
    detail: `${detailOf(objective, after)} Stopped: ${reason}.`,
    next: nextCall("look"),
    reason,
  });
}

type LaunchInit = {
  ctx: ToolCtx<PilotAfter>;
  args: PilotArgs;
  objective: PilotObjective;
  control: RunControl;
  latest: Latest;
  runId: () => string;
  budgetMs: number;
};

type LaunchCtx = LaunchInit & {
  ops: OpsCtx;
  read: () => PilotAfter;
  tally: SteerTally;
  watch: InterruptWatch;
};

function launchCtx(init: LaunchInit): LaunchCtx {
  const { ctx, objective, control } = init;
  const watch = watchInterrupts(
    { ...ctx, progress: control.progress, signal: control.signal },
    { death: true, newAttacker: false, rooted: true },
  );
  const ops: OpsCtx = {
    ...ctx,
    progress: control.progress,
    signal: AbortSignal.any([control.signal, watch.signal]),
  };
  const tally = steerTally(ops);
  return { ...init, ops, read: afterOf(ops, objective, tally), tally, watch };
}

function launchProgress(env: LaunchCtx): (after: PilotAfter) => void {
  const { ctx, control, latest, objective } = env;
  return (after: PilotAfter) => {
    latest.after = after;
    control.progress(
      `${after.decisions} decisions, walked ${Math.round(after.walkedYd)} yd`,
    );
    ctx.update(
      result("RUNNING", {
        after,
        detail: `steering to ${goalText(objective)}, ${after.decisions} decisions.`,
        runId: env.runId(),
      }),
    );
  };
}

async function launch(init: LaunchInit): Promise<RunEnd<Report>> {
  const env = launchCtx(init);
  const { control, latest, objective, ops, read, tally, watch } = env;
  const progress = launchProgress(env);
  try {
    const end = await steer({
      budgetMs: init.budgetMs,
      objective,
      ops,
      progress,
      read,
      tally,
    });
    const after = read();
    latest.after = after;
    if (control.signal.aborted)
      return runEnd(
        stopReport(control.signal, after),
        messageOf(control.signal.reason),
      );
    const cause = watch.cause();
    if (cause?.code === "died")
      return runEnd(
        result("FAILED", {
          after,
          detail: "you died on the way.",
          next: nextCall("recover"),
          reason: "died",
        }),
      );
    return runEnd(outcomeReport(objective, after, end));
  } catch (error) {
    if (error instanceof Refusal)
      return runEnd(refusalReport(error, latest.after));
    if (!control.signal.aborted) throw error;
    return runEnd(
      stopReport(control.signal, latest.after),
      messageOf(control.signal.reason),
    );
  } finally {
    watch.dispose();
  }
}

type SteerInit = {
  objective: PilotObjective;
  ops: OpsCtx;
  progress: (after: PilotAfter) => void;
  read: () => PilotAfter;
  tally: SteerTally;
  budgetMs: number;
};

async function steer(init: SteerInit): Promise<{
  outcome: { status: string; reason: string } | undefined;
  error: string | undefined;
}> {
  const { objective, ops, progress, read, tally, budgetMs } = init;
  const off = ops.handle.onPilotEvent((event) => {
    if (event.type !== "applied") return;
    trackApplied(ops, tally, event);
    progress(read());
  });
  try {
    const end = await awaitPilot(ops.handle, {
      objective,
      signal: ops.signal,
      timeoutMs: budgetMs,
    });
    return {
      error: end.error,
      outcome: end.outcome
        ? { reason: end.outcome.reason, status: end.outcome.status }
        : undefined,
    };
  } finally {
    off();
  }
}

function runningDetail(
  ctx: ViewCtx,
  objective: PilotObjective,
  after: PilotAfter,
): string {
  const walked =
    after.walkedYd < 10
      ? after.walkedYd.toFixed(1)
      : String(Math.round(after.walkedYd));
  return `steering to ${goalText(objective)}, ${after.decisions} decisions, walked ${walked} yd. ${youLine(ctx)}`;
}

async function runPilot(
  args: PilotArgs,
  ctx: ToolCtx<PilotAfter>,
): Promise<Report> {
  const objective = pilotObjective(args);
  checkReady(ctx);
  const minutes = args.minutes ?? 3;
  const budgetMs = minutes * 60_000;
  const latest: Latest = { after: emptyPilot(objective) };
  let runId = "";
  const run = ctx.rt.runs.start<Report>({
    args: pilotRunArgs(objective),
    kind: "pilot",
    launch: (control) =>
      launch({
        args,
        budgetMs,
        control,
        ctx,
        latest,
        objective,
        runId: () => runId,
      }),
    toolCallId: ctx.toolCallId,
  });
  runId = run.id;
  const waited = await awaitRun({ rt: ctx.rt, run });
  if (waited.kind === "ended") return { ...waited.end.value, runId };
  return result("RUNNING", {
    after: latest.after,
    body: waited.why === "human" ? [HUMAN_WROTE] : [],
    detail: runningDetail(ctx, objective, latest.after),
    next: `end your turn; a [game] message comes when ${runId} ends. Or ${nextCall("stop", { run: runId })}.`,
    runId,
  });
}

export const pilotSpec: GameToolSpec<typeof pilotParams, "pilot", PilotAfter> =
  {
    fallback: () => emptyPilot(),
    kind: "run",
    minimalArgs: { to: { x: 10, y: 0 } },
    name: "pilot",
    parameters: pilotParams,
    renderers: pilotRenderers,
    run: runPilot,
    text: {
      description:
        "Steers the character with Jev driving every movement decision: reach a point (to) or run one lap of a circle (circle). Jev picks run, veer, turn, strafe, back-up, jump and stop options several times a second from a movement frame. It waits until the objective completes, up to the minutes budget. Use it instead of travel when the task needs Jev-driven movement.",
      guidelines: [
        "Give exactly one of to or circle, with world coordinates. Never invent coordinates.",
        "The run ends completed, stopped (human takeover, abort, Jev down or time budget) or failed (death).",
      ],
      label: "Pilot",
    },
  };

export const pilotTool = defineGameTool(pilotSpec);
