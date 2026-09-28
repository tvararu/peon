import type {
  CombatState,
  ControlPose,
  RecoveryState,
  WorldHandle,
} from "@peon/core";
import type { GameLogEntry, LogEvent } from "#harness/contract/log";
import type { ToolName } from "#harness/contract/result";
import type {
  Clock,
  GameLog,
  ProgressTracker,
} from "#harness/contract/services";
import type { NoProgress } from "#harness/contract/views";

export const NO_PROGRESS_AT = 3;
export const STUCK_LOG_AT = 6;

const MOVE_YD = 5;
const RUN_ENDS: ReadonlySet<LogEvent> = new Set(["run/ended", "run/cancelled"]);
const PROGRESS_EVENTS: ReadonlySet<LogEvent> = new Set([
  "combat/kill_credit",
  "loot/item",
  "quest/progress",
  "quest/completed",
  "life/dead",
  "life/released",
  "life/alive",
  "chat/out",
]);

type Action = Parameters<ProgressTracker["afterAction"]>[0];
type Refused = { reason: string; times: number; tool: ToolName };
type State = {
  anchor: ControlPose | undefined;
  count: number;
  key: string | undefined;
  last: { at: number; event: LogEvent } | undefined;
  refused: Refused | undefined;
  run: string;
  since: number;
  stuckLogged: boolean;
  untried: string[];
};

function resetTo(state: State, key: string | undefined, now: number): void {
  state.count = 0;
  state.key = key;
  state.since = now;
  state.stuckLogged = false;
}

function progressed(state: State, at: number, event: LogEvent): void {
  state.last = { at, event };
  resetTo(state, undefined, at);
}

function observeEntry(state: State, entry: GameLogEntry): void {
  if (entry.event === "run/started") state.run = "running";
  if (RUN_ENDS.has(entry.event)) state.run = "ended";
  if (entry.progress || PROGRESS_EVENTS.has(entry.event))
    progressed(state, entry.ts, entry.event);
}

function farFrom(a: ControlPose, b: ControlPose): boolean {
  return a.mapId !== b.mapId || Math.hypot(a.x - b.x, a.y - b.y) > MOVE_YD;
}

function observePose(
  state: State,
  pose: ControlPose | undefined,
  now: number,
): void {
  if (!pose) return;
  if (state.anchor && !farFrom(state.anchor, pose)) return;
  const moved = state.anchor !== undefined;
  state.anchor = pose;
  if (moved) progressed(state, now, "control/move_stop");
}

function poseBucket(pose: ControlPose | undefined): string {
  return pose
    ? `${pose.mapId}:${Math.floor(pose.x / 2)}:${Math.floor(pose.y / 2)}`
    : "-";
}

function targetBucket({ target }: CombatState): string {
  if (!target) return "-";
  const tenths = target.maxHealth
    ? Math.floor(((target.health ?? 0) / target.maxHealth) * 10)
    : 0;
  return `${target.guid.toString(16)}:${tenths}`;
}

function corpseBucket(
  { corpse }: RecoveryState,
  pose: ControlPose | undefined,
): string {
  if (corpse.status !== "found" || !pose) return "-";
  return String(
    Math.floor(
      Math.hypot(corpse.position.x - pose.x, corpse.position.y - pose.y) / 5,
    ),
  );
}

function digestOf(handle: WorldHandle, run: string): string {
  const { pose } = handle.getControlState();
  const recovery = handle.getRecoveryState();
  return [
    recovery.life,
    poseBucket(pose),
    targetBucket(handle.getCombatState()),
    corpseBucket(recovery, pose),
    run,
  ].join("|");
}

function refusalText(refused: Refused | undefined): string | undefined {
  return refused
    ? `${refused.tool} ${refused.reason} x${refused.times}`
    : undefined;
}

function noteRefusal(state: State, { reason, status, tool }: Action): void {
  if (!(reason && (status === "REFUSED" || status === "FAILED"))) return;
  const same = state.refused?.tool === tool && state.refused.reason === reason;
  state.refused = {
    reason,
    times: same ? (state.refused?.times ?? 0) + 1 : 1,
    tool,
  };
}

function logStuck(state: State, log: GameLog): void {
  state.stuckLogged = true;
  const data = {
    actions: state.count,
    lastRefusal: refusalText(state.refused),
    untried: state.untried,
  };
  log.append({
    class: "log",
    data,
    domain: "agent",
    event: "agent/stuck",
    text: `No progress after ${state.count} actions.`,
  });
}

function afterAction(
  state: State,
  action: Action,
  deps: { clock: Clock; log: GameLog },
): void {
  if (action.kind === "read") return;
  const key = `${action.digest}|${action.reason ?? "-"}`;
  noteRefusal(state, action);
  if (action.untried.length > 0) state.untried = action.untried;
  if (key === state.key) state.count += 1;
  else resetTo(state, key, deps.clock.now());
  if (state.count >= STUCK_LOG_AT && !state.stuckLogged)
    logStuck(state, deps.log);
}

function noProgressOf(state: State, now: number): NoProgress | undefined {
  if (state.count < NO_PROGRESS_AT) return;
  return {
    actions: state.count,
    lastRefusal: refusalText(state.refused),
    sinceMs: now - state.since,
    untried: state.untried,
  };
}

export function createProgressTracker({
  clock,
  log,
}: {
  clock: Clock;
  log: GameLog;
}): ProgressTracker {
  const state: State = {
    anchor: undefined,
    count: 0,
    key: undefined,
    last: undefined,
    refused: undefined,
    run: "idle",
    since: clock.now(),
    stuckLogged: false,
    untried: [],
  };
  log.subscribe((entry) => observeEntry(state, entry));
  return {
    afterAction: (action) => afterAction(state, action, { clock, log }),
    attach(handle) {
      state.anchor = handle.getControlState().pose;
      return handle.onControlEvent((event) =>
        observePose(state, event.state.pose, clock.now()),
      );
    },
    count: () => state.count,
    digest: (handle) => digestOf(handle, state.run),
    lastProgress: () => state.last,
    noProgress: () => noProgressOf(state, clock.now()),
  };
}
