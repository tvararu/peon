import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { buildKeepAlive } from "#wow/areas/login/protocol";
import type { LoginEvent, LoginStore } from "#wow/areas/login/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export type LoginActs = { keepAlive: () => void };

export function loginRuntime(
  ctx: AreaRuntimeCtx<LoginEvent>,
  _store: LoginStore,
): AreaRuntime<LoginActs> {
  return {
    act: {
      keepAlive: () => ctx.send(GameOpcode.CMSG_KEEP_ALIVE, buildKeepAlive()),
    },
    dispose: () => undefined,
  };
}
