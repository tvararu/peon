import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import type { TicketsEvent } from "#wow/areas/tickets/store";

export type TicketsCtx = AreaRuntimeCtx<TicketsEvent>;

export const TICKETS_ANSWER_MS = 5000;

export function waitFor(
  ctx: TicketsCtx,
  match: (event: TicketsEvent) => boolean,
  send: () => void,
): Promise<TicketsEvent | undefined> {
  const cancel = new AbortController();
  const answered = ctx.until(match, {
    signal: AbortSignal.any([ctx.signal, cancel.signal]),
    timeoutMs: TICKETS_ANSWER_MS,
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
    (error: unknown): TicketsEvent | undefined => {
      if (error instanceof Error && error.message === "timeout") return;
      throw error;
    },
  );
}
