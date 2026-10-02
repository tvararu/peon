import type { AreaRuntimeCtx } from "#wow/areas/contract";
import type { ItemsEvent } from "#wow/areas/items/events";
import { findItem } from "#wow/areas/items/moves";
import {
  buildItemRefund,
  buildItemRefundInfo,
  type RefundInfoPacket,
} from "#wow/areas/items/protocol-refund";
import type {
  RefundInfoRequest,
  RefundOutcome,
  RefundRequest,
} from "#wow/areas/items/refunds";
import type { ItemsStore } from "#wow/areas/items/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const REFUND_ANSWER_MS = 5000;

export type RefundActs = {
  refundInfo: (itemGuid: bigint) => Promise<RefundInfoPacket | undefined>;
  refund: (itemGuid: bigint) => Promise<RefundOutcome>;
};

type Env = { ctx: AreaRuntimeCtx<ItemsEvent>; store: ItemsStore };

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

function ready({ ctx, store }: Env): void {
  if (!ctx.selfGuid() || store.inventory().status === "unknown")
    throw new Error("the character is not in world");
  if (store.life() !== "alive")
    throw new Error(`the character is ${store.life()}`);
}

function carried({ store }: Env, itemGuid: bigint): RefundRequest {
  const inventory = store.inventory();
  const item = findItem(inventory, itemGuid);
  if (!item) throw new Error(`item ${itemGuid} is not in the inventory`);
  return {
    entry: item.item.entry,
    itemGuid,
    requestedAt: 0,
  };
}

async function refundInfo(
  env: Env,
  itemGuid: bigint,
): Promise<RefundInfoPacket | undefined> {
  ready(env);
  const request = carried(env, itemGuid);
  const cached = env.store.refundOffer(itemGuid);
  if (cached) return cached;
  const snapshot = env.store.snapshot().refund;
  if (snapshot.infoPending)
    throw new Error("a refund query is already pending");
  if (snapshot.refundPending) throw new Error("a refund is already pending");
  const draft: RefundInfoRequest = {
    ...request,
    requestedAt: env.ctx.now(),
  };
  env.store.beginRefundInfo(draft);
  const settled = env.ctx.until(
    (event) =>
      (event.type === "refund_info" || event.type === "refund_info_none") &&
      event.itemGuid === itemGuid,
    { timeoutMs: REFUND_ANSWER_MS, signal: env.ctx.signal },
  );
  env.ctx.send(GameOpcode.CMSG_ITEM_REFUND_INFO, buildItemRefundInfo(itemGuid));
  try {
    await settled;
  } catch (error) {
    if (!isTimeout(error)) {
      env.store.abandonRefundInfo();
      throw error;
    }
    env.store.expireRefundInfo();
  }
  return env.store.snapshot().refund.lastInfo?.info;
}

async function refund(env: Env, itemGuid: bigint): Promise<RefundOutcome> {
  ready(env);
  const snapshot = env.store.snapshot().refund;
  if (snapshot.refundPending) throw new Error("a refund is already pending");
  if (snapshot.infoPending)
    throw new Error("a refund query is already pending");
  const draft: RefundRequest = {
    ...carried(env, itemGuid),
    requestedAt: env.ctx.now(),
  };
  env.store.beginRefund(draft);
  const settled = env.ctx.until(
    (event) =>
      (event.type === "refund_result" || event.type === "refund_unanswered") &&
      event.itemGuid === itemGuid,
    { timeoutMs: REFUND_ANSWER_MS, signal: env.ctx.signal },
  );
  env.ctx.send(GameOpcode.CMSG_ITEM_REFUND, buildItemRefund(itemGuid));
  try {
    await settled;
  } catch (error) {
    if (!isTimeout(error)) {
      env.store.abandonRefund();
      throw error;
    }
    env.store.expireRefund();
  }
  const last = env.store.snapshot().refund.last;
  if (!last) throw new Error("the refund went unanswered");
  return last;
}

export function refundActs(env: Env): RefundActs {
  return {
    refundInfo: (itemGuid) => refundInfo(env, itemGuid),
    refund: (itemGuid) => refund(env, itemGuid),
  };
}
