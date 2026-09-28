import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildKeepAlive,
  buildLogoutCancel,
  buildPlayerLogout,
} from "#wow/areas/login/protocol";
import type { LoginEvent, LoginStore } from "#wow/areas/login/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const LOGOUT_CANCEL_TIMEOUT_MS = 5000;

export type LoginActs = {
  keepAlive: () => void;
  cancelLogout: () => Promise<void>;
  playerLogout: () => void;
};

export function loginRuntime(
  ctx: AreaRuntimeCtx<LoginEvent>,
  _store: LoginStore,
): AreaRuntime<LoginActs> {
  return {
    act: {
      keepAlive: () => ctx.send(GameOpcode.CMSG_KEEP_ALIVE, buildKeepAlive()),
      cancelLogout: async () => {
        ctx.send(GameOpcode.CMSG_LOGOUT_CANCEL, buildLogoutCancel());
        await ctx.until((event) => event.type === "logout_cancelled", {
          timeoutMs: LOGOUT_CANCEL_TIMEOUT_MS,
        });
      },
      playerLogout: () =>
        ctx.send(GameOpcode.CMSG_PLAYER_LOGOUT, buildPlayerLogout()),
    },
    dispose: () => undefined,
  };
}
