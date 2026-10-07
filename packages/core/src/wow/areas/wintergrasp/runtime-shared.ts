import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import type { WintergraspEvent } from "#wow/areas/wintergrasp/store";

export type Ctx = AreaRuntimeCtx<WintergraspEvent>;

export type SendWait = {
  match: (event: WintergraspEvent) => boolean;
  timeoutMs: number;
  send: () => void;
};

export async function sendAndWait(
  ctx: Ctx,
  wait: SendWait,
): Promise<WintergraspEvent | undefined> {
  const cancel = new AbortController();
  const answered = ctx.until(wait.match, {
    signal: AbortSignal.any([ctx.signal, cancel.signal]),
    timeoutMs: wait.timeoutMs,
  });
  answered.catch(ignoreFailure);
  try {
    wait.send();
  } catch (error) {
    cancel.abort();
    throw error;
  }
  try {
    return await answered;
  } catch (error) {
    if (error instanceof Error && error.message === "timeout") return;
    throw error;
  }
}
