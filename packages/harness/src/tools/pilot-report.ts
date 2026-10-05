import { messageOf } from "@peon/core/lib/errors";
import type { PilotAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { RunEnd, RunStatus } from "#harness/contract/runs";
import type { ViewCtx } from "#harness/contract/services";
import type { PilotObjective } from "#harness/loops/pilot-types";
import { nameOf } from "#harness/ops/danger";
import type { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import { askHuman, nextCall } from "#harness/tools/next-call";

export type Report = ToolResult<PilotAfter>;

export function goalText(objective: PilotObjective): string {
  if (objective.kind === "reach") return `(${objective.x}, ${objective.y})`;
  return `circle (${objective.x}, ${objective.y}) r${objective.radius} ${objective.direction}`;
}

export function stopReport(signal: AbortSignal, after: PilotAfter): Report {
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

export function runStatus(
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

export function runEnd(report: Report, stop?: string): RunEnd<Report> {
  return {
    reason: stop ?? report.reason,
    status: runStatus(report, stop),
    summary: `${report.status} ${report.detail}`,
    value: report,
  };
}

export function refusalReport(refusal: Refusal, after: PilotAfter): Report {
  return result(refusal.status, {
    after,
    body: refusal.body,
    detail: refusal.detail,
    next: refusal.next,
    options: refusal.options,
    reason: refusal.reason,
  });
}

export function attackedReport(
  ctx: ViewCtx,
  objective: PilotObjective,
  after: PilotAfter,
  attacker: bigint | undefined,
): Report {
  const who = attacker === undefined ? "something" : nameOf(ctx, attacker);
  const ref = attacker === undefined ? undefined : ctx.rt.refs.refOf(attacker);
  return result("FAILED", {
    after,
    detail: `${who}${ref ? ` ${ref}` : ""} attacked you while steering to ${goalText(objective)}. ${detailOf(objective, after)} Stopped: attacked.`,
    next: ref ? nextCall("engage", { target: ref }) : nextCall("look"),
    reason: "attacked",
  });
}

export function interruptReport(
  ctx: ViewCtx,
  objective: PilotObjective,
  after: PilotAfter,
  cause: { code: string; attacker: bigint | undefined },
): Report | undefined {
  if (cause.code === "died")
    return result("FAILED", {
      after,
      detail: "you died on the way.",
      next: nextCall("recover"),
      reason: "died",
    });
  if (cause.code === "attacked")
    return attackedReport(ctx, objective, after, cause.attacker);
  return undefined;
}

export function detailOf(objective: PilotObjective, after: PilotAfter): string {
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

export function outcomeReport(
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
