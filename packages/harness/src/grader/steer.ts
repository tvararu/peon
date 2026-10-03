import type { SteerAt } from "#harness/grader/scenarios";
import type { ProgressJson, TriggerRow } from "#harness/grader/watch";

export const RESCUE_NUDGE =
  "You seem stuck. Try another way to finish the task.";
export const BUDGET_STOP = "Stop now and tell me where you got to.";
export const DONE_QUIET_MS = 30_000;
export const STOP_GRACE_MS = 60_000;
export const STATUS_STALE_MS = 30_000;

export type SteerCursor = { index: number; since: number };
export type EndMemory = {
  taskMs: number;
  nudgedAt: number | undefined;
  stopAt: number | undefined;
  stopReason: "budget" | "stuck" | undefined;
};
export type EndView = {
  now: number;
  tier: number;
  budgetMs: number;
  progress: ProgressJson | undefined;
  lastAnswerAt: number | undefined;
  answerAsks: boolean;
  statusAt: number;
  pending: boolean;
  runActive: boolean;
};
export type EndAction =
  | { kind: "wait" }
  | { kind: "nudge" }
  | { kind: "stop"; reason: "budget" | "stuck" }
  | { kind: "end"; end: "done" | "budget" | "stuck"; escape: boolean }
  | { kind: "abort"; evidence: string };

type Scheduled = { at: SteerAt };
type DueInit<T extends Scheduled> = {
  steers: readonly T[];
  cursor: SteerCursor;
  triggers: readonly TriggerRow[];
  now: number;
};

export type PendingView = {
  now: number;
  steers: number;
  steerIndex: number;
  actions: number;
  actionIndex: number;
  lastSteerAt: number | undefined;
  lastAnswerAt: number | undefined;
  windowEnd: number | undefined;
};

const WAIT: EndAction = { kind: "wait" };

export function stuckAfterMs(tier: number): number {
  if (tier === 0) return 90_000;
  return tier === 8 ? 480_000 : 180_000;
}

export function stuckStopMs(tier: number): number {
  return tier === 0 ? 60_000 : 120_000;
}

export function dueSteer<T extends Scheduled>({
  steers,
  cursor,
  triggers,
  now,
}: DueInit<T>): T | undefined {
  const steer = steers[cursor.index];
  if (steer === undefined) return undefined;
  const { at } = steer;
  if (at.kind === "elapsed")
    return now - cursor.since >= at.ms ? steer : undefined;
  const hit = triggers.filter(
    (row) => row.trigger === at.trigger && row.ms > cursor.since,
  )[(at.nth ?? 1) - 1];
  return hit !== undefined && now - hit.ms >= (at.delayMs ?? 0)
    ? steer
    : undefined;
}

export function pendingAction(view: PendingView): boolean {
  if (view.steerIndex < view.steers || view.actionIndex < view.actions)
    return true;
  if (
    view.lastSteerAt !== undefined &&
    (view.lastAnswerAt ?? -1) < view.lastSteerAt
  )
    return true;
  return view.windowEnd !== undefined && view.now < view.windowEnd;
}

export function describeAt(at: SteerAt): string {
  if (at.kind === "elapsed") return `elapsed:${at.ms}`;
  const nth = (at.nth ?? 1) > 1 ? `#${at.nth}` : "";
  const delay = at.delayMs === undefined ? "" : `+${at.delayMs}`;
  return `${at.trigger}${nth}${delay}`;
}

function afterStop(
  view: EndView,
  memory: EndMemory,
  stopAt: number,
): EndAction {
  const end = memory.stopReason ?? "budget";
  if (view.now - stopAt >= STOP_GRACE_MS)
    return { end, escape: true, kind: "end" };
  const answered = (view.lastAnswerAt ?? -1) >= stopAt;
  return answered && view.progress?.agent === "idle"
    ? { end, escape: false, kind: "end" }
    : WAIT;
}

const TRAILING_MARKUP = /[\s*_`"'\u201d\u2019)\]]+$/u;

export function asksHuman(answer: string): boolean {
  return answer.replace(TRAILING_MARKUP, "").endsWith("?");
}

function waitsOnHuman({
  answerAsks,
  lastAnswerAt,
  progress,
}: EndView): boolean {
  if (!answerAsks || lastAnswerAt === undefined) return false;
  const after = Math.max(
    progress?.lastProgress?.at ?? 0,
    progress?.lastToolCallAt ?? 0,
  );
  return after <= lastAnswerAt;
}

function isDone(view: EndView, taskMs: number): boolean {
  const { now, progress, lastAnswerAt, pending, runActive } = view;
  if (
    pending ||
    runActive ||
    waitsOnHuman(view) ||
    lastAnswerAt === undefined ||
    lastAnswerAt < taskMs ||
    progress?.agent !== "idle"
  )
    return false;
  const quietSince = Math.max(
    lastAnswerAt,
    progress.lastProgress?.at ?? 0,
    progress.lastToolCallAt ?? 0,
  );
  return now - quietSince >= DONE_QUIET_MS;
}

function stuckAction(view: EndView, memory: EndMemory): EndAction {
  if (view.runActive) return WAIT;
  const active = Math.max(
    memory.taskMs,
    view.lastAnswerAt ?? 0,
    view.progress?.lastProgress?.at ?? 0,
  );
  if (memory.nudgedAt === undefined)
    return view.now - active >= stuckAfterMs(view.tier)
      ? { kind: "nudge" }
      : WAIT;
  const waited = Math.min(view.now - memory.nudgedAt, view.now - active);
  return waited >= stuckStopMs(view.tier)
    ? { kind: "stop", reason: "stuck" }
    : WAIT;
}

export function endAction(view: EndView, memory: EndMemory): EndAction {
  if (view.now - view.statusAt > STATUS_STALE_MS)
    return {
      evidence: `status.json not updated for ${STATUS_STALE_MS / 1000} s`,
      kind: "abort",
    };
  if (memory.stopAt !== undefined)
    return afterStop(view, memory, memory.stopAt);
  if (view.now - memory.taskMs >= view.budgetMs)
    return { kind: "stop", reason: "budget" };
  if (isDone(view, memory.taskMs))
    return { end: "done", escape: false, kind: "end" };
  return stuckAction(view, memory);
}
