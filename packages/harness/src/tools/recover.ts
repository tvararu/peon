import { messageOf } from "@peon/core/lib/errors";
import type { RecoverAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { RunControl, RunEnd } from "#harness/contract/runs";
import type { OpsCtx, ToolCtx, ViewCtx } from "#harness/contract/services";
import { type InterruptCause, watchInterrupts } from "#harness/ops/danger";
import {
  aliveWhere,
  type RecoverHow,
  type RecoverOpResult,
  recoverOp,
} from "#harness/ops/recover";
import { Refusal } from "#harness/ops/refusal";
import { poseView, selfView, vitalsView } from "#harness/ops/views";
import { awaitRun } from "#harness/runs/wait";
import { defineGameTool, result } from "#harness/tools/define";
import type { GameToolSpec } from "#harness/tools/game-tool";
import { askHuman, nextCall } from "#harness/tools/next-call";
import { type RecoverArgs, recoverParams } from "#harness/tools/params-recover";
import { recoverRenderers } from "#harness/ui/renderers/live-run";

type Report = ToolResult<RecoverAfter>;

const HOWS = new Map<string, RecoverHow>([
  ["corpse", "corpse"],
  ["spirit_healer", "spirit_healer"],
  ["accept", "accept"],
]);
const HUMAN_WROTE = "The human wrote a message. Read it before you act.";

function sentence(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function whereText(ctx: ViewCtx): string {
  const pose = poseView(ctx);
  return pose ? ` (${Math.round(pose.x)}, ${Math.round(pose.y)})` : "";
}

function afterOf(
  ctx: ViewCtx,
  op: RecoverOpResult | undefined,
  durationMs: number,
): RecoverAfter {
  const vitals = vitalsView(ctx);
  return {
    alive: selfView(ctx).life === "alive",
    alternatives: op?.alternatives ?? [],
    corpseYd: op?.corpseYd,
    durationMs,
    hp: vitals.hp,
    legs: op?.legs ?? 0,
    maxHp: vitals.maxHp,
    pose: poseView(ctx),
    via: op?.via ?? "corpse",
  };
}

function viaText(op: RecoverOpResult, ctx: ViewCtx): string {
  const { via } = op;
  if (via === "corpse") return aliveWhere(op.corpseYd, poseView(ctx));
  if (via === "spirit_healer") return `at the spirit healer${whereText(ctx)}`;
  return `where you died${whereText(ctx)}`;
}

function failedReport(op: RecoverOpResult, after: RecoverAfter): Report {
  const cause = op.outcome.ok ? "failed" : op.outcome.cause;
  const others = `Other ways: ${op.alternatives
    .map((text, index) => (index === 0 ? text : sentence(text)))
    .join(". ")}.`;
  if (cause === "too_far")
    return result("REFUSED", {
      after,
      body: [others],
      detail:
        "the spirit healer is too far; it must be within 5 yd, and a ghost cannot use the path planner.",
      next: nextCall("recover"),
      reason: "too_far",
    });
  const healer = op.alternatives.some((text) =>
    text.startsWith("spirit healer"),
  );
  const where =
    op.corpseYd === undefined
      ? ""
      : `, still ${Math.round(op.corpseYd)} yd from your corpse`;
  return result("FAILED", {
    after,
    body: [others],
    detail: `${op.legs} legs${where} (${cause}).`,
    next: healer
      ? nextCall("recover", { how: "spirit_healer" })
      : askHuman("I cannot get back to life. What should I do?"),
    reason: cause,
  });
}

function report(ctx: ViewCtx, op: RecoverOpResult, durationMs: number): Report {
  const after = afterOf(ctx, op, durationMs);
  if (!op.outcome.ok) return failedReport(op, after);
  return result("DONE", {
    after,
    detail: `alive again ${viaText(op, ctx)}, after ${Math.round(durationMs / 1000)} s. HP ${after.hp}/${after.maxHp}.`,
  });
}

function stopReport(
  ctx: ViewCtx,
  signal: AbortSignal,
  durationMs: number,
): Report {
  const code = messageOf(signal.reason, "cancelled");
  const after = afterOf(ctx, undefined, durationMs);
  if (code === "human_stop" || code === "esc")
    return result("FAILED", {
      after,
      detail: "the human stopped you. Start nothing new.",
      next: "end your turn and wait for the human.",
      reason: "cancelled",
    });
  return result("FAILED", {
    after,
    detail: `the recovery was stopped (${code}).`,
    next: nextCall("recover"),
    reason: "cancelled",
  });
}

function interruptEnd(
  ctx: ViewCtx,
  cause: InterruptCause,
  durationMs: number,
): RunEnd<Report> {
  const ref =
    cause.attacker === undefined
      ? undefined
      : ctx.rt.refs.refOf(cause.attacker);
  const value = result("FAILED", {
    after: afterOf(ctx, undefined, durationMs),
    detail: `${cause.detail} The recovery stopped.`,
    next: ref ? nextCall("engage", { target: ref }) : nextCall("look"),
    reason: "interrupted",
  });
  return {
    reason: "interrupted",
    status: "interrupted",
    summary: `${value.status} ${value.detail}`,
    value,
  };
}

async function launch(init: {
  ctx: ToolCtx<RecoverAfter>;
  how: RecoverHow;
  control: RunControl;
}): Promise<RunEnd<Report>> {
  const { ctx, how, control } = init;
  const startedAt = ctx.rt.clock.now();
  const rules = { death: false, newAttacker: true, rooted: false };
  const watch = watchInterrupts(
    { ...ctx, progress: control.progress, signal: control.signal },
    rules,
  );
  const ops: OpsCtx = {
    ...ctx,
    progress: control.progress,
    signal: AbortSignal.any([control.signal, watch.signal]),
  };
  try {
    const op = await recoverOp(ops, how);
    const cause = watch.cause();
    if (cause) return interruptEnd(ops, cause, ctx.rt.clock.now() - startedAt);
    const value = report(ops, op, ctx.rt.clock.now() - startedAt);
    const status = op.outcome.ok ? "succeeded" : "failed";
    return {
      reason: value.reason,
      status,
      summary: `${value.status} ${value.detail}`,
      value,
    };
  } catch (error) {
    const cause = watch.cause();
    if (!control.signal.aborted && cause)
      return interruptEnd(ops, cause, ctx.rt.clock.now() - startedAt);
    if (!control.signal.aborted) throw error;
    const value = stopReport(
      ops,
      control.signal,
      ctx.rt.clock.now() - startedAt,
    );
    return {
      reason: messageOf(control.signal.reason),
      status: "cancelled",
      summary: `${value.status} ${value.detail}`,
      value,
    };
  } finally {
    watch.dispose();
  }
}

function emptyRecover(): RecoverAfter {
  return {
    alive: false,
    alternatives: [],
    corpseYd: undefined,
    durationMs: 0,
    hp: undefined,
    legs: 0,
    maxHp: undefined,
    pose: undefined,
    via: "corpse",
  };
}

async function runRecover(
  args: RecoverArgs,
  ctx: ToolCtx<RecoverAfter>,
): Promise<Report> {
  const { life } = selfView(ctx);
  if (life === "alive")
    throw new Refusal({
      detail: "you are alive; there is nothing to recover.",
      next: nextCall("look"),
      reason: "alive",
    });
  if (life === "unknown")
    throw new Refusal({
      detail: "your life state is not known yet.",
      next: askHuman("Am I dead? The game has not told me yet."),
      reason: "life_unknown",
    });
  const how = HOWS.get(args.how ?? "corpse") ?? "corpse";
  const run = ctx.rt.runs.start<Report>({
    args,
    kind: "recover",
    launch: (control) => launch({ control, ctx, how }),
    toolCallId: ctx.toolCallId,
  });
  const waited = await awaitRun({ rt: ctx.rt, run });
  if (waited.kind === "ended") return { ...waited.end.value, runId: run.id };
  const vitals = vitalsView(ctx);
  return result("RUNNING", {
    after: afterOf(ctx, undefined, 0),
    body: waited.why === "human" ? [HUMAN_WROTE] : [],
    detail: `recover by ${how.replace("_", " ")}. You: ${selfView(ctx).life}, HP ${vitals.hp}/${vitals.maxHp}${whereText(ctx)}.`,
    next: `end your turn; a [game] message comes when ${run.id} ends. Or ${nextCall("stop", { run: run.id })}.`,
    runId: run.id,
  });
}

export const recoverSpec: GameToolSpec<
  typeof recoverParams,
  "recover",
  RecoverAfter
> = {
  fallback: emptyRecover,
  kind: "run",
  minimalArgs: {},
  name: "recover",
  parameters: recoverParams,
  renderers: recoverRenderers,
  run: runRecover,
  text: {
    description:
      "Brings you back to life after a death. It releases your spirit, walks your ghost to your corpse and takes the corpse back. It can also use a spirit healer or accept a resurrection. It waits until you are alive or it fails.",
    guidelines: [
      "Use recover at once when a result says that you are dead. Do not use travel as a ghost.",
    ],
    label: "Recover",
  },
};

export const recoverTool = defineGameTool(recoverSpec);
