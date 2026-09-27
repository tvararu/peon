import {
  type ControlPose,
  type CycleState,
  type GotoTarget,
  type NavigationState,
  nextStepFor,
  type TacticsOutcome,
  type WorldHandle,
} from "@peon/core";
import { messageOf } from "@peon/core/lib/errors";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";

export type GotoEnd = {
  status: "arrived" | "refused" | "stopped";
  refusal: string | undefined;
  floors: number[] | undefined;
  nextStep: string | undefined;
  traveledYd: number;
  pose: ControlPose | undefined;
};

export const GOTO_POLL_MS = 500;

const CATEGORIES = ["wait", "pick_destination", "unreachable", "stop"];

type GotoInit = { target: GotoTarget; signal: AbortSignal; pollMs?: number };
type WaitInit = { handle: WorldHandle; signal: AbortSignal; pollMs: number };
type EndInit = {
  handle: WorldHandle;
  from: ControlPose | undefined;
  status: GotoEnd["status"];
  refusal: string | undefined;
};

export function rawRefusal(message: string): string {
  const cut = message.indexOf(": ");
  if (cut < 0 || !CATEGORIES.includes(message.slice(0, cut))) return message;
  return message.slice(cut + 2);
}

function idle(nav: NavigationState): boolean {
  return !nav.active && nav.replan?.pending !== true;
}

function travelled(
  from: ControlPose | undefined,
  to: ControlPose | undefined,
): number {
  if (!(from && to)) return 0;
  return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
}

function gotoEnd({ handle, from, status, refusal }: EndInit): GotoEnd {
  const pose = handle.getControlState().pose;
  const { floors } = handle.getNavigationState();
  const nextStep = nextStepFor(refusal) ?? undefined;
  return {
    floors,
    nextStep,
    pose,
    refusal,
    status,
    traveledYd: travelled(from, pose),
  };
}

function navigationEnd({ handle, signal, pollMs }: WaitInit): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (stopped: boolean) => {
      clearInterval(timer);
      unsubscribe();
      signal.removeEventListener("abort", onAbort);
      resolve(stopped);
    };
    const check = () => {
      if (idle(handle.getNavigationState())) finish(false);
    };
    const onAbort = () => {
      finish(true);
      handle.halt();
    };
    const unsubscribe = handle.onControlEvent((event) => {
      if (event.type === "movement_stopped") check();
    });
    const timer = setInterval(check, pollMs);
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    check();
  });
}

export async function awaitGoto(
  handle: WorldHandle,
  { target, signal, pollMs = GOTO_POLL_MS }: GotoInit,
): Promise<GotoEnd> {
  const from = handle.getControlState().pose;
  try {
    handle.goTo(target);
  } catch (error) {
    return gotoEnd({
      from,
      handle,
      refusal: rawRefusal(messageOf(error)),
      status: "refused",
    });
  }
  const stopped = await navigationEnd({ handle, pollMs, signal });
  const { blockedReason } = handle.getNavigationState();
  if (stopped)
    return gotoEnd({ from, handle, refusal: blockedReason, status: "stopped" });
  const status = blockedReason === undefined ? "arrived" : "refused";
  return gotoEnd({ from, handle, refusal: blockedReason, status });
}

export type FightEnd = {
  outcome: TacticsOutcome | undefined;
  error: string | undefined;
};
export type CycleEnd = { state: CycleState; error: string | undefined };

const JEV_UNAVAILABLE = "jev_unavailable";

type TacticsInit = { guid: bigint; instruction: string; signal: AbortSignal };
type CycleInit = {
  guids: bigint[];
  instruction: string;
  maxStarts: number;
  signal: AbortSignal;
};
type QuestCycleInit = {
  questId: number;
  sources: number[];
  instruction: string;
  maxStarts: number | undefined;
  signal: AbortSignal;
};
type CycleWait = {
  handle: WorldHandle;
  signal: AbortSignal;
  start: () => Promise<void>;
};

function watchFight(handle: WorldHandle, hex: string) {
  let runId: string | undefined;
  let outcome: TacticsOutcome | undefined;
  let done: () => void = ignoreFailure;
  const ended = new Promise<void>((resolve) => {
    done = resolve;
  });
  const stop = handle.onTacticsEvent((event) => {
    if (event.type === "started" && event.targetGuid === hex)
      runId = event.runId;
    if (runId === undefined || event.runId !== runId) return;
    if (event.type === "outcome") {
      outcome = {
        observation: event.observation,
        reason: event.reason,
        status: event.status,
      };
      done();
    }
    if (event.type === "stopped") {
      outcome ??= event.state.lastOutcome;
      done();
    }
  });
  return { ended, outcome: () => outcome, stop };
}

export async function awaitTactics(
  handle: WorldHandle,
  { guid, instruction, signal }: TacticsInit,
): Promise<FightEnd> {
  const watch = watchFight(handle, `0x${guid.toString(16)}`);
  const onAbort = () => handle.halt();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    await Promise.race([
      handle.startTactics(guid, instruction, signal),
      watch.ended,
    ]);
    return {
      error: undefined,
      outcome: watch.outcome() ?? handle.getTacticsState().lastOutcome,
    };
  } catch (error) {
    return { error: messageOf(error), outcome: watch.outcome() };
  } finally {
    watch.stop();
    signal.removeEventListener("abort", onAbort);
  }
}

async function cycleEnd({
  handle,
  signal,
  start,
}: CycleWait): Promise<CycleEnd> {
  let unsubscribe: () => void = ignoreFailure;
  const stopped = new Promise<void>((resolve) => {
    unsubscribe = handle.onCycleEvent((event) => {
      if (event.type === "stopped") resolve();
      if (event.type === "started" && signal.aborted) handle.stopCycle();
    });
  });
  const onAbort = () => handle.stopCycle();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    await Promise.race([stopped, start().then(() => stopped)]);
    return { error: undefined, state: handle.getCycleState() };
  } catch (error) {
    return { error: messageOf(error), state: handle.getCycleState() };
  } finally {
    unsubscribe();
    signal.removeEventListener("abort", onAbort);
  }
}

export function awaitCycle(
  handle: WorldHandle,
  { guids, instruction, maxStarts, signal }: CycleInit,
): Promise<CycleEnd> {
  return cycleEnd({
    handle,
    signal,
    start: () => handle.startCycle(guids, instruction, maxStarts),
  });
}

export function awaitQuestCycle(
  handle: WorldHandle,
  init: QuestCycleInit,
): Promise<CycleEnd> {
  const { questId, sources, instruction, maxStarts, signal } = init;
  const start = () =>
    handle.startQuestCycle(questId, sources, instruction, maxStarts);
  return cycleEnd({ handle, signal, start });
}

export function jevCode({ outcome, error }: FightEnd): string | undefined {
  const reason = outcome?.reason;
  if (reason === "jev_timeout" || reason?.startsWith(JEV_UNAVAILABLE))
    return JEV_UNAVAILABLE;
  return error?.startsWith(JEV_UNAVAILABLE) ? JEV_UNAVAILABLE : undefined;
}
