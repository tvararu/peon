import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import type { TimeEvent, TimeState, TimeStore } from "#wow/areas/time/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const TIME_QUERY_TIMEOUT_MS = 5000;

export type TimeActs = {
  query: () => Promise<TimeState>;
  requestUiTime: () => Promise<TimeState>;
};

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
  let uiTimePending: Promise<TimeState> | undefined;
  function requestUiTime(): Promise<TimeState> {
    if (uiTimePending) return uiTimePending;
    ctx.send(GameOpcode.CMSG_WORLD_STATE_UI_TIMER_UPDATE);
    const pending = ctx
      .until((event) => event.type === "ui_time", {
        timeoutMs: TIME_QUERY_TIMEOUT_MS,
      })
      .then((event) => event.state)
      .finally(() => {
        uiTimePending = undefined;
      });
    uiTimePending = pending;
    return pending;
  }
  const off = core.self.onEvent((event) => {
    if (event.type === "login_verified") query().catch(ignoreFailure);
  });
  return { act: { query, requestUiTime }, dispose: off };
}
