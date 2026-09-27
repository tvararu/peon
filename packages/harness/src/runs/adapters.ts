import {
  type ControlPose,
  type GotoTarget,
  type NavigationState,
  nextStepFor,
  type WorldHandle,
} from "@tuicraft/core";
import { messageOf } from "@tuicraft/core/lib/errors";

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
      handle.halt();
      finish(true);
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
