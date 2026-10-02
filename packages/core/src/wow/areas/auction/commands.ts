import { ignoreFailure } from "#lib/ignore-failure";
import {
  type AuctionRow,
  buildAuctionListPendingSales,
  buildAuctionPlaceBid,
  buildAuctionRemoveItem,
  buildAuctionSellItem,
  MAX_MONEY_AMOUNT,
} from "#wow/areas/auction/protocol";
import {
  AUCTIONEER_YARDS,
  type AuctionEvent,
  type AuctionRequest,
  type AuctionStore,
} from "#wow/areas/auction/store";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import { readInventory } from "#wow/inventory";
import { GameOpcode } from "#wow/protocol/opcodes";

export const AUCTION_ANSWER_MS = 10_000;

export type CommandEnv = {
  ctx: AreaRuntimeCtx<AuctionEvent>;
  store: AuctionStore;
};

export function requireCommandWorld(env: CommandEnv): void {
  if (!env.ctx.selfGuid()) throw new Error("the character is not in world");
}

export function requireCommandAuctioneer(env: CommandEnv, npc: bigint): void {
  const yards = env.store.reach(npc);
  if (yards === undefined || yards > AUCTIONEER_YARDS)
    throw new Error("no auctioneer in range");
}

export function requireCommandHouse(env: CommandEnv): bigint {
  const house = env.store.snapshot().house;
  if (house === undefined) throw new Error("no auction house is open");
  return house.auctioneer;
}

export function isCommandTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

export const AUCTION_HOURS_MINUTES: Record<number, number> = {
  12: 720,
  24: 1440,
  48: 2880,
};
export const AUCTION_SELL_COUNT_LIMIT = 1000;

export type PostAuctionOpts = {
  item: bigint;
  count: number;
  bid: number;
  buyout: number;
  hours: number;
};

export type AuctionCommandOutcome =
  | { status: "ok"; auctionId: number; bidError?: number }
  | { status: "refused"; why: string }
  | { status: "unanswered" };

export type PendingSalesOutcome =
  | { status: "ok"; count: number }
  | { status: "unanswered" };

function whole(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xff_ff_ff_ff)
    throw new Error(`${label} ${value} is not one word`);
  return value;
}

function checkTradable(env: CommandEnv, item: bigint, count: number): void {
  const self = env.ctx.selfGuid();
  if (self === undefined) throw new Error("the character is not in world");
  const held = readInventory(self, env.store.entityOf);
  const found = held.slots.find(
    (slot) => slot.status === "occupied" && slot.guid === item,
  );
  if (found?.status !== "occupied") throw new Error("item_not_found");
  if (
    found.region !== "equipment" &&
    found.region !== "backpack" &&
    found.region !== "bag" &&
    found.region !== "bag_item"
  )
    throw new Error("item_not_found");
  if (found.item.flagBits?.soulbound || (found.item.duration ?? 0) !== 0)
    throw new Error("not_tradeable");
  if (
    found.region === "bag" &&
    held.slots.some(
      (slot) =>
        slot.region === "bag_item" &&
        slot.bag === found.slot &&
        slot.status === "occupied",
    )
  )
    throw new Error("bag_not_empty");
  if (count > (found.item.count ?? 1)) throw new Error("count_too_large");
}

type CommandSend = {
  request: AuctionRequest;
  opcode: number;
  body: Uint8Array;
  action: "sell" | "cancel" | "bid";
};

async function runCommand(
  env: CommandEnv,
  send: CommandSend,
): Promise<AuctionCommandOutcome> {
  const { request, opcode, body, action } = send;
  const settled = env.ctx.until(
    (event) => event.type === "command_result" && event.action === action,
    { timeoutMs: AUCTION_ANSWER_MS },
  );
  try {
    env.store.begin(request);
  } catch (error) {
    settled.catch(ignoreFailure);
    throw error;
  }
  try {
    env.ctx.send(opcode, body);
  } catch (error) {
    env.store.abandon();
    settled.catch(ignoreFailure);
    throw error;
  }
  try {
    const event = await settled;
    if (event.type !== "command_result") {
      env.store.expire();
      return { status: "unanswered" };
    }
    if (event.result.status === "refused") return event.result;
    if (event.result.status === "unanswered") return { status: "unanswered" };
    return {
      ...(event.result.bidError === undefined
        ? {}
        : { bidError: event.result.bidError }),
      auctionId: event.auctionId,
      status: "ok",
    };
  } catch (error) {
    env.store.expire();
    if (!isCommandTimeout(error)) throw error;
    return { status: "unanswered" };
  }
}

export async function postAuction(
  env: CommandEnv,
  opts: PostAuctionOpts,
): Promise<AuctionCommandOutcome> {
  requireCommandWorld(env);
  const npc = requireCommandHouse(env);
  requireCommandAuctioneer(env, npc);
  const minutes = AUCTION_HOURS_MINUTES[opts.hours];
  if (minutes === undefined)
    throw new Error(`auction hours ${opts.hours} must be 12, 24 or 48`);
  whole(opts.bid, "bid");
  whole(opts.buyout, "buyout");
  if (opts.bid === 0) throw new Error("bid 0 is not one auction bid");
  if (opts.bid > MAX_MONEY_AMOUNT || opts.buyout > MAX_MONEY_AMOUNT)
    throw new Error("price over MAX_MONEY_AMOUNT");
  whole(opts.count, "count");
  if (opts.count === 0 || opts.count > AUCTION_SELL_COUNT_LIMIT)
    throw new Error(`count ${opts.count} out of 1-1000`);
  checkTradable(env, opts.item, opts.count);
  return await runCommand(env, {
    action: "sell",
    body: buildAuctionSellItem(npc, {
      bid: opts.bid,
      buyout: opts.buyout,
      items: [{ count: opts.count, guid: opts.item }],
      minutes,
    }),
    opcode: GameOpcode.CMSG_AUCTION_SELL_ITEM,
    request: { kind: "sell", npc, requestedAt: env.ctx.now() },
  });
}

export async function cancelAuction(
  env: CommandEnv,
  id: number,
): Promise<AuctionCommandOutcome> {
  requireCommandWorld(env);
  const npc = requireCommandHouse(env);
  requireCommandAuctioneer(env, npc);
  whole(id, "auctionId");
  if (id === 0) throw new Error("auctionId 0 is not one auction");
  return await runCommand(env, {
    action: "cancel",
    body: buildAuctionRemoveItem(npc, id),
    opcode: GameOpcode.CMSG_AUCTION_REMOVE_ITEM,
    request: { id, kind: "cancel", npc, requestedAt: env.ctx.now() },
  });
}

function heldRows(store: AuctionStore): readonly AuctionRow[] {
  const state = store.snapshot();
  return [
    ...(state.search?.rows ?? []),
    ...(state.owned?.rows ?? []),
    ...(state.bids?.rows ?? []),
  ];
}

function checkBidPrice(row: AuctionRow | undefined, price: number): void {
  if (!row) return;
  if (price <= row.bid || price < row.startBid) throw new Error("bid_too_low");
  if (
    (price < row.buyout || row.buyout === 0) &&
    price < row.bid + row.minOutbid
  )
    throw new Error("bid_too_low");
}

export async function bid(
  env: CommandEnv,
  id: number,
  price: number,
): Promise<AuctionCommandOutcome> {
  requireCommandWorld(env);
  const npc = requireCommandHouse(env);
  requireCommandAuctioneer(env, npc);
  whole(id, "auctionId");
  whole(price, "price");
  if (id === 0 || price === 0)
    throw new Error("auction bid needs id and price");
  checkBidPrice(
    heldRows(env.store).find((row) => row.id === id),
    price,
  );
  return await runCommand(env, {
    action: "bid",
    body: buildAuctionPlaceBid(npc, id, price),
    opcode: GameOpcode.CMSG_AUCTION_PLACE_BID,
    request: { id, kind: "bid", npc, price, requestedAt: env.ctx.now() },
  });
}

export async function listPendingSales(
  env: CommandEnv,
): Promise<PendingSalesOutcome> {
  requireCommandWorld(env);
  const npc = env.store.snapshot().house?.auctioneer ?? 0n;
  const settled = env.ctx.until((event) => event.type === "pending_sales", {
    timeoutMs: AUCTION_ANSWER_MS,
  });
  try {
    env.store.begin({ kind: "pending", npc, requestedAt: env.ctx.now() });
  } catch (error) {
    settled.catch(ignoreFailure);
    throw error;
  }
  try {
    env.ctx.send(
      GameOpcode.CMSG_AUCTION_LIST_PENDING_SALES,
      buildAuctionListPendingSales(npc),
    );
  } catch (error) {
    env.store.abandon();
    settled.catch(ignoreFailure);
    throw error;
  }
  try {
    const event = await settled;
    if (event.type !== "pending_sales") {
      env.store.expire();
      return { status: "unanswered" };
    }
    return { count: event.count, status: "ok" };
  } catch (error) {
    env.store.expire();
    if (!isCommandTimeout(error)) throw error;
    return { status: "unanswered" };
  }
}
