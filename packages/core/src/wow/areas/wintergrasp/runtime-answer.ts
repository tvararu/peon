import {
  buildEntryInviteResponse,
  buildQueueInviteResponse,
} from "#wow/areas/wintergrasp/protocol";
import type { Ctx } from "#wow/areas/wintergrasp/runtime-shared";
import { sendAndWait } from "#wow/areas/wintergrasp/runtime-shared";
import type {
  WintergraspActs,
  WintergraspAnswer,
} from "#wow/areas/wintergrasp/runtime-types";
import type { WintergraspStore } from "#wow/areas/wintergrasp/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const WG_QUEUE_MS = 5000;
export const WG_ENTRY_MS = 10_000;

export function answerQueueActs(
  ctx: Ctx,
  store: WintergraspStore,
): Pick<WintergraspActs, "answerQueue"> {
  async function answerQueue(accept: boolean): Promise<WintergraspAnswer> {
    const state = store.snapshot();
    if (state.phase !== "queue_offered" || state.battleId === undefined)
      throw new Error("no_offer");
    const battleId = state.battleId;
    if (!accept) {
      ctx.send(
        GameOpcode.CMSG_BATTLEFIELD_MGR_QUEUE_INVITE_RESPONSE,
        buildQueueInviteResponse(battleId, false),
      );
      store.declineOffer();
      return { status: "declined" };
    }
    const reply = await sendAndWait(ctx, {
      match: (event) => event.type === "wg_queued",
      send: () =>
        ctx.send(
          GameOpcode.CMSG_BATTLEFIELD_MGR_QUEUE_INVITE_RESPONSE,
          buildQueueInviteResponse(battleId, true),
        ),
      timeoutMs: WG_QUEUE_MS,
    });
    if (reply?.type !== "wg_queued") return { status: "no_reply" };
    return reply.queued
      ? { battleId: reply.battleId, status: "queued" }
      : { status: "refused" };
  }

  return { answerQueue };
}

export function answerEntryActs(
  ctx: Ctx,
  store: WintergraspStore,
): Pick<WintergraspActs, "answerEntry"> {
  async function answerEntry(accept: boolean): Promise<WintergraspAnswer> {
    const state = store.snapshot();
    if (state.phase !== "entry_offered" || state.battleId === undefined)
      throw new Error("no_offer");
    const battleId = state.battleId;
    if (!accept) {
      ctx.send(
        GameOpcode.CMSG_BATTLEFIELD_MGR_ENTRY_INVITE_RESPONSE,
        buildEntryInviteResponse(battleId, false),
      );
      store.declineOffer();
      return { status: "declined" };
    }
    const reply = await sendAndWait(ctx, {
      match: (event) =>
        event.type === "wg_entered" || event.type === "wg_ejected",
      send: () =>
        ctx.send(
          GameOpcode.CMSG_BATTLEFIELD_MGR_ENTRY_INVITE_RESPONSE,
          buildEntryInviteResponse(battleId, true),
        ),
      timeoutMs: WG_ENTRY_MS,
    });
    if (reply?.type === "wg_entered")
      return { battleId: reply.battleId, status: "entered" };
    if (reply?.type === "wg_ejected")
      return {
        battleId: reply.battleId,
        reason: reply.reason,
        status: "ejected",
      };
    return { status: "no_reply" };
  }

  return { answerEntry };
}
