import type { AreaRuntimeCtx } from "#wow/areas/contract";
import { buildExitRequest } from "#wow/areas/wintergrasp/protocol";
import { sendAndWait } from "#wow/areas/wintergrasp/runtime-shared";
import type {
  WintergraspActs,
  WintergraspAnswer,
} from "#wow/areas/wintergrasp/runtime-types";
import type {
  WintergraspEvent,
  WintergraspStore,
} from "#wow/areas/wintergrasp/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const WG_EXIT_MS = 3000;

type Ctx = AreaRuntimeCtx<WintergraspEvent>;

export function exitQueueActs(
  ctx: Ctx,
  store: WintergraspStore,
): Pick<WintergraspActs, "exitQueue"> {
  async function exitQueue(): Promise<WintergraspAnswer> {
    const state = store.snapshot();
    if (
      state.battleId === undefined ||
      (state.phase !== "queued" && state.phase !== "entry_offered")
    )
      throw new Error("no_offer");
    const battleId = state.battleId;
    const reply = await sendAndWait(ctx, {
      match: (event) => event.type === "wg_ejected",
      send: () =>
        ctx.send(
          GameOpcode.CMSG_BATTLEFIELD_MGR_EXIT_REQUEST,
          buildExitRequest(battleId),
        ),
      timeoutMs: WG_EXIT_MS,
    });
    return reply?.type === "wg_ejected"
      ? { battleId: reply.battleId, reason: reply.reason, status: "left" }
      : { status: "no_reply" };
  }

  return { exitQueue };
}
