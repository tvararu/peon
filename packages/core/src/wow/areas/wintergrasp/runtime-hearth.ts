import type { AreaRuntimeCtx } from "#wow/areas/contract";
import { WINTERGRASP_MAP } from "#wow/areas/wintergrasp/protocol";
import type { WintergraspActs } from "#wow/areas/wintergrasp/runtime-types";
import type {
  WintergraspEvent,
  WintergraspStore,
} from "#wow/areas/wintergrasp/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const WG_HEARTH_MS = 10_000;

type Ctx = AreaRuntimeCtx<WintergraspEvent>;

export function hearthActs(
  ctx: Ctx,
  _store: WintergraspStore,
  core: CoreStores,
): Pick<WintergraspActs, "hearthAndResurrect"> {
  function hearthAndResurrect(): Promise<{ status: "teleported" }> {
    if (core.self.mapId !== WINTERGRASP_MAP)
      return Promise.reject(new Error("not_in_wintergrasp"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        done();
        reject(new Error("timeout"));
      }, WG_HEARTH_MS);
      const off = core.self.onEvent((event) => {
        if (event.type !== "new_world" && event.type !== "near_teleport")
          return;
        done();
        resolve({ status: "teleported" });
      });
      const abort = () => {
        done();
        reject(new Error("aborted"));
      };
      function done(): void {
        clearTimeout(timer);
        off();
        ctx.signal.removeEventListener("abort", abort);
      }
      ctx.signal.addEventListener("abort", abort, { once: true });
      try {
        ctx.send(GameOpcode.CMSG_HEARTH_AND_RESURRECT);
      } catch (error) {
        done();
        reject(error);
      }
    });
  }

  return { hearthAndResurrect };
}
