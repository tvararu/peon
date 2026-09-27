import type { Unsubscribe } from "@tuicraft/core";

export type SettleInit<E> = {
  subscribe: (cb: (event: E) => void) => Unsubscribe;
  match: (event: E) => boolean;
  timeoutMs: number;
  signal?: AbortSignal;
  send?: () => void | Promise<void>;
};

export async function settle<E>(init: SettleInit<E>): Promise<E | undefined> {
  const { match, send, signal, subscribe, timeoutMs } = init;
  signal?.throwIfAborted();
  const outcome = Promise.withResolvers<E | undefined>();
  const timer = setTimeout(() => outcome.resolve(undefined), timeoutMs);
  const abort = () => outcome.reject(signal?.reason);
  const unsubscribe = subscribe((event) => {
    if (match(event)) outcome.resolve(event);
  });
  signal?.addEventListener("abort", abort, { once: true });
  try {
    await send?.();
    return await outcome.promise;
  } finally {
    clearTimeout(timer);
    unsubscribe();
    signal?.removeEventListener("abort", abort);
  }
}
