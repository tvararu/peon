import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import type { TimeEvent, TimeState, TimeStore } from "#wow/areas/time/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const TIME_QUERY_TIMEOUT_MS = 5000;

export type TimeActs = { query: () => Promise<TimeState> };

export function timeRuntime(
  ctx: AreaRuntimeCtx<TimeEvent>,
  _store: TimeStore,
  core: CoreStores,
): AreaRuntime<TimeActs> {
  async function query(): Promise<TimeState> {
    ctx.send(GameOpcode.CMSG_QUERY_TIME);
    const reply = await ctx.until((event) => event.type === "query_reply", {
      timeoutMs: TIME_QUERY_TIMEOUT_MS,
    });
    return reply.state;
  }
  const off = core.self.onEvent((event) => {
    if (event.type === "login_verified") query().catch(ignoreFailure);
  });
  return { act: { query }, dispose: off };
}
