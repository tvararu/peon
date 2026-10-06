import { ignoreFailure } from "#lib/ignore-failure";
import type { ArenaEvent } from "#wow/areas/arena/store";
import type { AreaRuntimeCtx } from "#wow/areas/contract";

export const ARENA_ANSWER_MS = 5000;
export const ARENA_INSPECT_MS = 3000;

export type Ctx = AreaRuntimeCtx<ArenaEvent>;

export function noReply(
  ctx: Ctx,
  match: (event: ArenaEvent) => boolean,
  timeoutMs: number,
  send: () => void,
): Promise<ArenaEvent | undefined> {
  const cancel = new AbortController();
  const answered = ctx.until(match, {
    signal: AbortSignal.any([ctx.signal, cancel.signal]),
    timeoutMs,
  });
  answered.catch(ignoreFailure);
  try {
    send();
  } catch (error) {
    cancel.abort();
    throw error;
  }
  return answered.then(
    (event) => event,
    (error: unknown): ArenaEvent | undefined => {
      if (error instanceof Error && error.message === "timeout") return;
      throw error;
    },
  );
}
