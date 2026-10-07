import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import type { GuildadminEvent } from "#wow/areas/guildadmin/store";

export const GUILDADMIN_ANSWER_MS = 5000;

export type GuildadminCtx = AreaRuntimeCtx<GuildadminEvent>;

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

export async function request(
  ctx: GuildadminCtx,
  send: () => void,
  match: (event: GuildadminEvent) => boolean,
): Promise<GuildadminEvent | undefined> {
  const cancel = new AbortController();
  const reply = ctx.until(match, {
    signal: AbortSignal.any([ctx.signal, cancel.signal]),
    timeoutMs: GUILDADMIN_ANSWER_MS,
  });
  reply.catch(ignoreFailure);
  try {
    send();
  } catch (error) {
    cancel.abort();
    throw error;
  }
  try {
    return await reply;
  } catch (error) {
    if (!isTimeout(error)) throw error;
    return undefined;
  }
}
