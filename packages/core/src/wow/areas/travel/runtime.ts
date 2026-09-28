import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  type BindPoint,
  buildBinderActivate,
} from "#wow/areas/travel/protocol";
import type { TravelEvent, TravelStore } from "#wow/areas/travel/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const BIND_TIMEOUT_MS = 5000;

export type TravelOutcome<T = Readonly<Record<never, never>>> =
  | ({ status: "ok" } & T)
  | { status: "refused"; reason: string }
  | { status: "no_answer" };

export type TravelActs = {
  bindActivate: (npc: bigint) => Promise<TravelOutcome<{ home: BindPoint }>>;
};

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

export function travelRuntime(
  ctx: AreaRuntimeCtx<TravelEvent>,
  store: TravelStore,
): AreaRuntime<TravelActs> {
  async function bindActivate(
    npc: bigint,
  ): Promise<TravelOutcome<{ home: BindPoint }>> {
    if (store.snapshot().bindPending !== undefined)
      return { status: "refused", reason: "busy" };
    store.beginBind(npc);
    try {
      ctx.send(GameOpcode.CMSG_BINDER_ACTIVATE, buildBinderActivate(npc));
      await ctx.until((e) => e.type === "bind_point" && e.reason === "bound", {
        timeoutMs: BIND_TIMEOUT_MS,
      });
      const home = store.snapshot().home;
      return home ? { status: "ok", home } : { status: "no_answer" };
    } catch (error) {
      if (isTimeout(error)) return { status: "no_answer" };
      throw error;
    } finally {
      store.endBind();
    }
  }
  return { act: { bindActivate }, dispose: () => undefined };
}
