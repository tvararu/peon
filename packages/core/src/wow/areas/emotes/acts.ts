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
  | { ok: true }
  | { ok: false; reason: "ready_check" | "dead" | "cancelled" }
  | { ok: false; reason: "unknown_emote"; closest: string[] };

export type EmotesActs = {
  emote: (emote: number) => EmoteOutcome;
  textEmote: (
    nameOrId: string | number,
    targetGuid?: bigint,
  ) => Promise<TextEmoteOutcome>;
};

function createWaiter(signal: AbortSignal) {
  const waiting = new Set<() => void>();
  const wait = (ms: number): Promise<boolean> => {
    const { promise, resolve } = Promise.withResolvers<boolean>();
    const finish = (completed: boolean) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      waiting.delete(cancel);
      resolve(completed);
    };
    const cancel = () => finish(false);
    const timer = setTimeout(() => finish(true), ms);
    signal.addEventListener("abort", cancel, { once: true });
    waiting.add(cancel);
    return promise;
  };
  const cancelAll = () => {
    for (const cancel of [...waiting]) cancel();
  };
  return { cancelAll, wait };
}

function resolveEmote(nameOrId: string | number): number | undefined {
  if (typeof nameOrId === "number")
    return TEXT_EMOTE_IDS.has(nameOrId) ? nameOrId : undefined;
  return TEXT_EMOTES.get(nameOrId.trim().toLowerCase());
}

export function emoteActs(
  ctx: AreaRuntimeCtx<EmotesEvent>,
  store: EmoteStore,
): { acts: EmotesActs; cancelWaits: () => void } {
  let nextAt = 0;
  const { cancelAll, wait } = createWaiter(ctx.signal);
  const emote = (id: number): EmoteOutcome => {
    if (id !== NONE_EMOTE && id !== WAVE_EMOTE)
      return { ok: false, reason: "only_wave" };
    if (store.life() !== "alive") return { ok: false, reason: "dead" };
    ctx.send(GameOpcode.CMSG_EMOTE, buildEmote(id));
    return { ok: true };
  };

  const textEmote = async (
    nameOrId: string | number,
    targetGuid = 0n,
  ): Promise<TextEmoteOutcome> => {
    const id = resolveEmote(nameOrId);
    if (id === undefined)
      return {
        ok: false,
        reason: "unknown_emote",
        closest: closestEmotes(String(nameOrId), CLOSEST_EMOTES),
      };
    if (id === READY_EMOTE) return { ok: false, reason: "ready_check" };
    if (store.life() !== "alive") return { ok: false, reason: "dead" };
    const at = Math.max(ctx.now(), nextAt);
    nextAt = at + TEXT_EMOTE_GAP_MS;
    const delay = at - ctx.now();
    if (delay > 0 && !(await wait(delay)))
      return { ok: false, reason: "cancelled" };
    if (store.life() !== "alive") return { ok: false, reason: "dead" };
    ctx.send(
      GameOpcode.CMSG_TEXT_EMOTE,
      buildTextEmote(id, NO_EMOTE_NUMBER, targetGuid),
    );
    return { ok: true };
  };

  return {
    acts: { emote, textEmote },
    cancelWaits: cancelAll,
  };
}
