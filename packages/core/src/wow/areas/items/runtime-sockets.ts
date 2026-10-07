import type { AreaRuntimeCtx } from "#wow/areas/contract";
import type { ItemsEvent } from "#wow/areas/items/events";
import { findItem, LAST_EQUIPMENT_SLOT } from "#wow/areas/items/moves";
import {
  buildCancelTempEnchantment,
  buildSocketGems,
  MAX_GEM_SOCKETS,
} from "#wow/areas/items/protocol-sockets";
import type { SocketOutcome, SocketRequest } from "#wow/areas/items/sockets";
import type { ItemsStore } from "#wow/areas/items/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const SOCKET_ANSWER_MS = 5000;

export type CancelTempEnchantOutcome = { status: "ok"; slot: number };
export type SocketActs = {
  socket: (itemGuid: bigint, gems: readonly bigint[]) => Promise<SocketOutcome>;
  cancelTempEnchant: (slot: number) => Promise<CancelTempEnchantOutcome>;
};

type Env = { ctx: AreaRuntimeCtx<ItemsEvent>; store: ItemsStore };

const SETTLED = new Set<ItemsEvent["type"]>([
  "socket_refused",
  "socket_unanswered",
  "sockets_updated",
]);

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

function ready({ ctx, store }: Env): void {
  if (!ctx.selfGuid() || store.inventory().status === "unknown")
    throw new Error("the character is not in world");
  if (store.life() !== "alive")
    throw new Error(`the character is ${store.life()}`);
  if (store.snapshot().sockets.pending)
    throw new Error("a socket is already pending");
  if (store.snapshot().sets.usePending) throw new Error("a set use is pending");
}

function gemSlots(
  { store }: Env,
  itemGuid: bigint,
  gems: readonly bigint[],
): SocketRequest {
  if (gems.length === 0) throw new Error("socket needs at least one gem");
  if (gems.length > MAX_GEM_SOCKETS)
    throw new Error(`socket takes at most ${MAX_GEM_SOCKETS} gems`);
  if (new Set(gems).size !== gems.length)
    throw new Error("socket needs distinct gems");
  const inventory = store.inventory();
  const item = findItem(inventory, itemGuid);
  if (!item) throw new Error(`item ${itemGuid} is not in the inventory`);
  for (const gem of gems) {
    if (gem === itemGuid)
      throw new Error(`gem ${gem} is the item being socketed`);
    const held = findItem(inventory, gem);
    if (held?.region !== "backpack" && held?.region !== "bag_item")
      throw new Error(`gem ${gem} is not in the bags`);
  }
  return {
    entry: item.item.entry,
    gems: [...gems],
    itemGuid,
    requestedAt: 0,
  };
}

async function socket(
  env: Env,
  itemGuid: bigint,
  gems: readonly bigint[],
): Promise<SocketOutcome> {
  ready(env);
  const draft = gemSlots(env, itemGuid, gems);
  const pending: SocketRequest = { ...draft, requestedAt: env.ctx.now() };
  env.store.beginSocket(pending);
  const settled = env.ctx.until(
    (event) =>
      SETTLED.has(event.type) &&
      (event.type !== "sockets_updated" || event.itemGuid === itemGuid),
    { timeoutMs: SOCKET_ANSWER_MS },
  );
  env.ctx.send(GameOpcode.CMSG_SOCKET_GEMS, buildSocketGems(itemGuid, gems));
  try {
    await settled;
  } catch (error) {
    if (!isTimeout(error)) {
      env.store.abandonSocket();
      throw error;
    }
    env.store.expireSocket();
  }
  const last = env.store.snapshot().sockets.last;
  if (!last) throw new Error("the socket went unanswered");
  return last;
}

function checkSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < 0 || slot > LAST_EQUIPMENT_SLOT)
    throw new Error(`slot ${slot} is not an equipment slot`);
}

function cancelTempEnchant(
  env: Env,
  slot: number,
): Promise<CancelTempEnchantOutcome> {
  checkSlot(slot);
  if (!env.ctx.selfGuid()) throw new Error("the character is not in world");
  env.ctx.send(
    GameOpcode.CMSG_CANCEL_TEMP_ENCHANTMENT,
    buildCancelTempEnchantment(slot),
  );
  return Promise.resolve({ slot, status: "ok" });
}

export function socketActs(env: Env): SocketActs {
  return {
    cancelTempEnchant: (slot) => cancelTempEnchant(env, slot),
    socket: (itemGuid, gems) => socket(env, itemGuid, gems),
  };
}
