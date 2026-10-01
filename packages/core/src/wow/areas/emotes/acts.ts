import type { AreaRuntimeCtx } from "#wow/areas/contract";
import {
  closestEmotes,
  TEXT_EMOTE_IDS,
  TEXT_EMOTES,
} from "#wow/areas/emotes/names";
import { buildEmote, buildTextEmote } from "#wow/areas/emotes/protocol";
import type { EmoteStore, EmotesEvent } from "#wow/areas/emotes/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const TEXT_EMOTE_GAP_MS = 1000;
export const CLOSEST_EMOTES = 5;
const READY_EMOTE = 126;
const NO_EMOTE_NUMBER = 0xff_ff_ff_ff;
const WAVE_EMOTE = 3;
const NONE_EMOTE = 0;

export type EmoteOutcome =
  | { ok: true }
  | { ok: false; reason: "only_wave" | "dead" };
export type TextEmoteOutcome =
  | { ok: true; textEmote: number }
  | { ok: false; reason: "ready_check" | "dead" | "cancelled" }
  | { ok: false; reason: "unknown_emote"; closest: string[] };

export type EmotesActs = {
  emote: (emote: number) => EmoteOutcome;
  textEmote: (
    nameOrId: string | number,
    targetGuid?: bigint,
    signal?: AbortSignal,
  ) => Promise<TextEmoteOutcome>;
};

function createWaiter(signal: AbortSignal) {
  const waiting = new Set<() => void>();
  const waitFor =
    (caller: AbortSignal | undefined) =>
    (ms: number): Promise<boolean> => {
      if (signal.aborted || caller?.aborted) return Promise.resolve(false);
      const { promise, resolve } = Promise.withResolvers<boolean>();
      const finish = (completed: boolean) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
        caller?.removeEventListener("abort", cancel);
        waiting.delete(cancel);
        resolve(completed);
      };
      const cancel = () => finish(false);
      const timer = setTimeout(() => finish(true), ms);
      signal.addEventListener("abort", cancel, { once: true });
      caller?.addEventListener("abort", cancel, { once: true });
      waiting.add(cancel);
      return promise;
    };
  const waitTurn = (
    caller: AbortSignal | undefined,
    turn: Promise<void>,
  ): Promise<boolean> => {
    if (signal.aborted || caller?.aborted) return Promise.resolve(false);
    const { promise, resolve } = Promise.withResolvers<boolean>();
    const finish = (ready: boolean) => {
      signal.removeEventListener("abort", cancel);
      caller?.removeEventListener("abort", cancel);
      waiting.delete(cancel);
      resolve(ready);
    };
    const cancel = () => finish(false);
    signal.addEventListener("abort", cancel, { once: true });
    caller?.addEventListener("abort", cancel, { once: true });
    waiting.add(cancel);
    void turn.then(() => finish(true));
    return promise;
  };
  const cancelAll = () => {
    for (const cancel of [...waiting]) cancel();
  };
  return { cancelAll, waitFor, waitTurn };
}

function resolveEmote(nameOrId: string | number): number | undefined {
  if (typeof nameOrId === "number")
    return TEXT_EMOTE_IDS.has(nameOrId) ? nameOrId : undefined;
  return TEXT_EMOTES.get(nameOrId.trim().toLowerCase());
}

type SpamGuard = {
  lastSentAt: number | undefined;
  tail: Promise<void>;
};

function createSpamGuard(): SpamGuard {
  return { lastSentAt: undefined, tail: Promise.resolve() };
}

function enqueue(guard: SpamGuard): {
  release: () => void;
  turn: Promise<void>;
} {
  const turn = guard.tail;
  const next = Promise.withResolvers<void>();
  guard.tail = next.promise;
  return { release: () => next.resolve(), turn };
}

type GapWait = (ms: number) => Promise<boolean>;

async function waitGap(
  now: () => number,
  wait: GapWait,
  lastSentAt: number | undefined,
): Promise<boolean> {
  while (true) {
    const since =
      lastSentAt === undefined ? TEXT_EMOTE_GAP_MS : now() - lastSentAt;
    if (TEXT_EMOTE_GAP_MS - since <= 0) return true;
    if (!(await wait(TEXT_EMOTE_GAP_MS - since))) return false;
  }
}
type QueuedSend = {
  ctx: AreaRuntimeCtx<EmotesEvent>;
  disposed: () => boolean;
  guard: SpamGuard;
  id: number;
  release: () => void;
  caller: AbortSignal | undefined;
  store: EmoteStore;
  targetGuid: bigint;
  turn: Promise<void>;
  waitFor: (caller: AbortSignal | undefined) => GapWait;
  waitTurn: (
    caller: AbortSignal | undefined,
    turn: Promise<void>,
  ) => Promise<boolean>;
};
function sendQueued(send: QueuedSend): Promise<TextEmoteOutcome> {
  const cancelled = (): boolean =>
    send.disposed() || send.ctx.signal.aborted || send.caller?.aborted === true;
  const run = async (): Promise<TextEmoteOutcome> => {
    if (!(await send.waitTurn(send.caller, send.turn))) {
      void send.turn.then(send.release);
      return { ok: false, reason: "cancelled" };
    }
    try {
      if (cancelled()) return { ok: false, reason: "cancelled" };
      const wait = send.waitFor(send.caller);
      if (!(await waitGap(send.ctx.now, wait, send.guard.lastSentAt)))
        return { ok: false, reason: "cancelled" };
      if (cancelled()) return { ok: false, reason: "cancelled" };
      if (send.store.life() !== "alive") return { ok: false, reason: "dead" };
      send.guard.lastSentAt = send.ctx.now();
      send.ctx.send(
        GameOpcode.CMSG_TEXT_EMOTE,
        buildTextEmote(send.id, NO_EMOTE_NUMBER, send.targetGuid),
      );
      return { ok: true, textEmote: send.id };
    } finally {
      send.release();
    }
  };
  return run();
}

export function emoteActs(
  ctx: AreaRuntimeCtx<EmotesEvent>,
  store: EmoteStore,
): { acts: EmotesActs; cancelWaits: () => void } {
  const guard = createSpamGuard();
  let disposed = false;
  const { cancelAll, waitFor, waitTurn } = createWaiter(ctx.signal);
  const cancelWaits = () => {
    disposed = true;
    cancelAll();
  };
  const emote = (id: number): EmoteOutcome => {
    if (id !== NONE_EMOTE && id !== WAVE_EMOTE)
      return { ok: false, reason: "only_wave" };
    if (store.life() !== "alive") return { ok: false, reason: "dead" };
    ctx.send(GameOpcode.CMSG_EMOTE, buildEmote(id));
    return { ok: true };
  };

  const textEmote = (
    nameOrId: string | number,
    targetGuid = 0n,
    caller?: AbortSignal,
  ): Promise<TextEmoteOutcome> => {
    const id = resolveEmote(nameOrId);
    if (id === undefined)
      return Promise.resolve({
        ok: false,
        reason: "unknown_emote",
        closest: closestEmotes(String(nameOrId), CLOSEST_EMOTES),
      });
    if (id === READY_EMOTE)
      return Promise.resolve({ ok: false, reason: "ready_check" });
    if (store.life() !== "alive")
      return Promise.resolve({ ok: false, reason: "dead" });
    if (caller?.aborted === true)
      return Promise.resolve({ ok: false, reason: "cancelled" });
    const { release, turn } = enqueue(guard);
    return sendQueued({
      caller,
      ctx,
      disposed: () => disposed,
      guard,
      id,
      release,
      store,
      targetGuid,
      turn,
      waitFor,
      waitTurn,
    });
  };

  return {
    acts: { emote, textEmote },
    cancelWaits,
  };
}
