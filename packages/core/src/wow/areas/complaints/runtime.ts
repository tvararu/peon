import {
  buildComplainChat,
  buildComplainMail,
  type ComplaintDetail,
} from "#wow/areas/complaints/protocol";
import type { ComplaintStore } from "#wow/areas/complaints/store";
import type { ComplaintsEvent } from "#wow/areas/complaints/types";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const COMPLAIN_ANSWER_MS = 3000;

export type ComplaintsActs = {
  complain: (
    guid: bigint,
    detail: ComplaintDetail,
    signal?: AbortSignal,
  ) => Promise<boolean>;
};

function bodyOf(guid: bigint, detail: ComplaintDetail): Uint8Array {
  if (detail.kind === "mail") return buildComplainMail(guid, detail.mailId);
  return buildComplainChat(guid, detail);
}

export function complaintsRuntime(
  ctx: AreaRuntimeCtx<ComplaintsEvent>,
  _store: ComplaintStore,
  _core: CoreStores,
): AreaRuntime<ComplaintsActs> {
  return {
    act: {
      async complain(guid, detail, signal): Promise<boolean> {
        const settled = ctx.until(
          (event) => event.type === "complaint_received",
          { timeoutMs: COMPLAIN_ANSWER_MS, ...(signal ? { signal } : {}) },
        );
        ctx.send(GameOpcode.CMSG_COMPLAIN, bodyOf(guid, detail));
        try {
          await settled;
          return true;
        } catch (error) {
          if (error instanceof Error && error.message === "timeout")
            return false;
          throw error;
        }
      },
    },
    dispose: () => undefined,
  };
}
