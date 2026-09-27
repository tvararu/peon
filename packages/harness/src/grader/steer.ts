import type { Scenario, SteerAt } from "#harness/grader/scenarios";
import type { ProgressJson, TriggerRow } from "#harness/grader/watch";

export const RESCUE_NUDGE = "You seem stuck. What is blocking you?";
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
  statusAt: number;
};
export type EndAction =
  | { kind: "wait" }
  | { kind: "nudge" }
  | { kind: "stop"; reason: "budget" | "stuck" }
  | { kind: "end"; end: "done" | "budget" | "stuck"; escape: boolean }
  | { kind: "abort"; evidence: string };

type Steer = Scenario["steers"][number];
type DueInit = {
  steers: Scenario["steers"];
  cursor: SteerCursor;
  triggers: readonly TriggerRow[];
  now: number;
};

const WAIT: EndAction = { kind: "wait" };

export function stuckAfterMs(tier: number): number {
  if (tier === 0) return 90_000;
  return tier === 8 ? 480_000 : 180_000;
}

export function stuckStopMs(tier: number): number {
  return tier === 0 ? 60_000 : 120_000;
}

export function dueSteer({
  steers,
  cursor,
  triggers,
  now,
}: DueInit): Steer | undefined {
  const steer = steers[cursor.index];
  if (steer === undefined) return undefined;
  const { at } = steer;
  if (at.kind === "elapsed")
    return now - cursor.since >= at.ms ? steer : undefined;
  return triggers.some(
    (row) => row.trigger === at.trigger && row.ms > cursor.since,
  )
    ? steer
    : undefined;
}

export function describeAt(at: SteerAt): string {
  return at.kind === "trigger" ? at.trigger : `elapsed:${at.ms}`;
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

function isDone(
  { now, progress, lastAnswerAt }: EndView,
  taskMs: number,
): boolean {
  if (
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
