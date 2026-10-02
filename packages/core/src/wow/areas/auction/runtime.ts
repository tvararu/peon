import { ignoreFailure } from "#lib/ignore-failure";
import {
  type AuctionQuery,
  buildAuctionHello,
  buildAuctionListBidderItems,
  buildAuctionListItems,
  buildAuctionListOwnerItems,
} from "#wow/areas/auction/protocol";
import {
  AUCTIONEER_YARDS,
  type AuctionEvent,
  type AuctionResult,
  type AuctionStore,
} from "#wow/areas/auction/store";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const AUCTION_ANSWER_MS = 10_000;

export type AuctionActs = {
  openAuctionHouse: (npc: bigint) => Promise<AuctionResult>;
  searchAuctions: (
    query: Omit<AuctionQuery, "npc" | "from"> & { from?: number },
  ) => Promise<AuctionResult>;
  listOwnAuctions: (from?: number) => Promise<AuctionResult>;
  listBids: (outbidIds?: readonly number[]) => Promise<AuctionResult>;
};

type Env = {
  ctx: AreaRuntimeCtx<AuctionEvent>;
  store: AuctionStore;
};

function requireWorld(env: Env): void {
  if (!env.ctx.selfGuid()) throw new Error("the character is not in world");
}

function requireAuctioneer(env: Env, npc: bigint): void {
  const yards = env.store.reach(npc);
  if (yards === undefined || yards > AUCTIONEER_YARDS)
    throw new Error("no auctioneer in range");
}

function requireHouse(env: Env): bigint {
  const house = env.store.snapshot().house;
  if (house === undefined) throw new Error("no auction house is open");
  return house.auctioneer;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

async function openAuctionHouse(env: Env, npc: bigint): Promise<AuctionResult> {
  requireWorld(env);
  requireAuctioneer(env, npc);
  const settled = env.ctx.until(
    (event) => event.type === "house_opened" && event.auctioneer === npc,
    { timeoutMs: AUCTION_ANSWER_MS },
  );
  try {
    env.store.begin({ kind: "open", npc, requestedAt: env.ctx.now() });
  } catch (error) {
    settled.catch(ignoreFailure);
    throw error;
  }
  try {
    env.ctx.send(GameOpcode.MSG_AUCTION_HELLO, buildAuctionHello(npc));
  } catch (error) {
    env.store.abandon();
    settled.catch(ignoreFailure);
    throw error;
  }
  try {
    await settled;
    return { status: "ok" };
  } catch (error) {
    env.store.expire();
    if (!isTimeout(error)) throw error;
    return { status: "unanswered" };
  }
}

async function searchAuctions(
  env: Env,
  query: Omit<AuctionQuery, "npc" | "from"> & { from?: number },
): Promise<AuctionResult> {
  requireWorld(env);
  const npc = requireHouse(env);
  requireAuctioneer(env, npc);
  const from = query.from ?? 0;
  const settled = env.ctx.until(
    (event) => event.type === "listed" && event.kind === "search",
    { timeoutMs: AUCTION_ANSWER_MS },
  );
  try {
    env.store.begin({ from, kind: "search", npc, requestedAt: env.ctx.now() });
  } catch (error) {
    settled.catch(ignoreFailure);
    throw error;
  }
  try {
    env.ctx.send(
      GameOpcode.CMSG_AUCTION_LIST_ITEMS,
      buildAuctionListItems({ ...query, from, npc }),
    );
  } catch (error) {
    env.store.abandon();
    settled.catch(ignoreFailure);
    throw error;
  }
  try {
    await settled;
    return { status: "ok" };
  } catch (error) {
    env.store.expire();
    if (!isTimeout(error)) throw error;
    return { status: "unanswered" };
  }
}

async function listOwnAuctions(env: Env, from = 0): Promise<AuctionResult> {
  requireWorld(env);
  const npc = requireHouse(env);
  requireAuctioneer(env, npc);
  const settled = env.ctx.until(
    (event) => event.type === "listed" && event.kind === "owned",
    { timeoutMs: AUCTION_ANSWER_MS },
  );
  try {
    env.store.begin({ from, kind: "owned", npc, requestedAt: env.ctx.now() });
  } catch (error) {
    settled.catch(ignoreFailure);
    throw error;
  }
  try {
    env.ctx.send(
      GameOpcode.CMSG_AUCTION_LIST_OWNER_ITEMS,
      buildAuctionListOwnerItems(npc, from),
    );
  } catch (error) {
    env.store.abandon();
    settled.catch(ignoreFailure);
    throw error;
  }
  try {
    await settled;
    return { status: "ok" };
  } catch (error) {
    env.store.expire();
    if (!isTimeout(error)) throw error;
    return { status: "unanswered" };
  }
}

async function listBids(
  env: Env,
  outbidIds: readonly number[] = [],
): Promise<AuctionResult> {
  requireWorld(env);
  const npc = requireHouse(env);
  requireAuctioneer(env, npc);
  const settled = env.ctx.until(
    (event) => event.type === "listed" && event.kind === "bids",
    { timeoutMs: AUCTION_ANSWER_MS },
  );
  try {
    env.store.begin({
      from: 0,
      kind: "bids",
      npc,
      outbidIds: [...outbidIds],
      requestedAt: env.ctx.now(),
    });
  } catch (error) {
    settled.catch(ignoreFailure);
    throw error;
  }
  try {
    env.ctx.send(
      GameOpcode.CMSG_AUCTION_LIST_BIDDER_ITEMS,
      buildAuctionListBidderItems(npc, 0, outbidIds),
    );
  } catch (error) {
    env.store.abandon();
    settled.catch(ignoreFailure);
    throw error;
  }
  try {
    await settled;
    return { status: "ok" };
  } catch (error) {
    env.store.expire();
    if (!isTimeout(error)) throw error;
    return { status: "unanswered" };
  }
}

export function auctionRuntime(
  ctx: AreaRuntimeCtx<AuctionEvent>,
  store: AuctionStore,
  _core: CoreStores,
): AreaRuntime<AuctionActs> {
  const env = { ctx, store };
  return {
    act: {
      listBids: (outbidIds) => listBids(env, outbidIds),
      listOwnAuctions: (from) => listOwnAuctions(env, from),
      openAuctionHouse: (npc) => openAuctionHouse(env, npc),
      searchAuctions: (query) => searchAuctions(env, query),
    },
    dispose: () => undefined,
  };
}
