import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";
import type { GameLogEntry, LogClass, LogDraft } from "#harness/contract/log";
import type { Clock, HarnessRuntime } from "#harness/contract/services";

export type WakeCandidate = Pick<GameLogEntry, "class" | "data" | "event">;
export type WakeGuard = { admit: (entry: WakeCandidate) => LogClass };

export const WAKE_MIN_GAP_MS = 5000;
export const WAKE_PER_MINUTE = 6;
export const WAKE_BURST = 3;
export const SENDER_GAP_MS = 20_000;
export const SENDER_JOIN_MS = 2000;
export const ATTACKER_GAP_MS = 30_000;
export const STUCK_WAKE_MS = 300_000;

const ATTACKED = "combat/attacked";

type HeldInit = {
  entry: WakeCandidate;
  now: number;
  since: number | undefined;
};

function createBucket(start: number) {
  let tokens = WAKE_BURST;
  let at = start;
  return {
    take(now: number): boolean {
      const refill = ((now - at) * WAKE_PER_MINUTE) / 60_000;
      tokens = Math.min(WAKE_BURST, tokens + refill);
      at = now;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}

function senderKey({ data, event }: WakeCandidate): string | undefined {
  const who = data["sender"] ?? data["from"] ?? data["attacker"];
  if (typeof who === "string") return `${event}:${who}`;
  return event === ATTACKED ? event : undefined;
}

function heldClass({ entry, now, since }: HeldInit): LogClass | undefined {
  if (since === undefined) return undefined;
  const attack = entry.event === ATTACKED;
  if (!attack && now - since < SENDER_JOIN_MS) return "wake";
  if (now - since >= (attack ? ATTACKER_GAP_MS : SENDER_GAP_MS))
    return undefined;
  return attack ? "log" : "passive";
}

export function createWakeGuard(clock: Clock): WakeGuard {
  const bucket = createBucket(clock.now());
  const senders = new Map<string, number>();
  return {
    admit(entry) {
      if (entry.class !== "wake") return entry.class;
      const now = clock.now();
      const key = senderKey(entry);
      const since = key === undefined ? undefined : senders.get(key);
      const held = heldClass({ entry, now, since });
      if (held !== undefined) return held;
      if (!bucket.take(now)) return "passive";
      if (key !== undefined) senders.set(key, now);
      return "wake";
    },
  };
}

export const STUCK_CHECK_MS = 30_000;

export type StuckWatch = { start: () => void; stop: () => void };

type StuckInit = { rt: HarnessRuntime; everyMs?: number };

function stuckDraft(untried: string[], idleMs: number): LogDraft {
  const minutes = Math.round(idleMs / 60_000);
  const list = untried.length > 0 ? ` Untried: ${untried.join(", ")}.` : "";
  const text = `No progress for ${minutes} min.${list} Tell the human what blocks you.`;
  return {
    class: "wake",
    data: { idleMs, untried },
    delivered: false,
    domain: "agent",
    event: "agent/stuck",
    text,
  };
}

export function createStuckWatch({
  rt,
  everyMs = STUCK_CHECK_MS,
}: StuckInit): StuckWatch {
  let humanAt: number | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: () => void = ignoreFailure;
  const check = () => {
    if (humanAt === undefined) return;
    const since = Math.max(humanAt, rt.progress.lastProgress()?.at ?? humanAt);
    const idleMs = rt.clock.now() - since;
    if (idleMs < STUCK_WAKE_MS) return;
    humanAt = undefined;
    rt.log.append(stuckDraft(rt.progress.noProgress()?.untried ?? [], idleMs));
  };
  return {
    start() {
      unsubscribe = rt.log.subscribe((entry) => {
        if (entry.event === "human/input") humanAt = entry.ts;
      });
      timer = setInterval(check, everyMs);
    },
    stop() {
      clearInterval(timer);
      unsubscribe();
    },
  };
}
