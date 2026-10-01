import { bounded } from "#lib/abort";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import type { ItemsEvent } from "#wow/areas/items/events";
import { type HeldSlot, positionRefusal, slotAt } from "#wow/areas/items/moves";
import type { ItemPosition } from "#wow/areas/items/protocol";
import {
  buildItemTextQuery,
  buildOpenItem,
  buildReadItem,
} from "#wow/areas/items/protocol-read";
import type { ReadKind, ReadOutcome } from "#wow/areas/items/reads";
import type { ItemsStore } from "#wow/areas/items/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { RewardsOpenLoot } from "#wow/rewards";
import type { CoreStores } from "#wow/session-stores";

export const READ_ANSWER_MS = 5000;
export const TEXT_ANSWER_MS = 5000;

export type ReadActs = {
  open: (from: ItemPosition) => Promise<RewardsOpenLoot>;
  read: (from: ItemPosition) => Promise<ReadOutcome>;
  queryText: (guid: bigint) => Promise<string | undefined>;
};

type Env = {
  ctx: AreaRuntimeCtx<ItemsEvent>;
  store: ItemsStore;
  core: CoreStores;
};

const READ_SETTLED = new Set<ItemsEvent["type"]>([
  "read_ok",
  "read_failed",
  "read_unanswered",
]);

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

function held({ ctx, store }: Env, from: ItemPosition): HeldSlot {
  const inventory = store.inventory();
  if (!ctx.selfGuid() || inventory.status === "unknown")
    throw new Error("the character is not in world");
  if (store.snapshot().read.pending)
    throw new Error("a read or open is already pending");
  if (store.snapshot().sets.usePending) throw new Error("a set use is pending");
  const refusal = positionRefusal(from);
  if (refusal) throw new Error(refusal);
  const found = slotAt(inventory, from);
  if (!found) throw new Error(`bag ${from.bag} slot ${from.slot} is empty`);
  return found;
}

function begin(env: Env, kind: ReadKind, item: HeldSlot): void {
  env.store.beginRead({
    kind,
    itemGuid: item.guid,
    entry: item.item.entry,
    from: { bag: item.bag, slot: item.slot },
    requestedAt: env.ctx.now(),
  });
}

function lastRead({ store }: Env): ReadOutcome {
  const last = store.snapshot().read.last;
  if (!last) throw new Error("the read did not settle");
  return last;
}

async function read(env: Env, from: ItemPosition): Promise<ReadOutcome> {
  const { ctx, store } = env;
  const item = held(env, from);
  begin(env, "read", item);
  const settled = ctx.until((event) => READ_SETTLED.has(event.type), {
    timeoutMs: READ_ANSWER_MS,
  });
  ctx.send(GameOpcode.CMSG_READ_ITEM, buildReadItem(from));
  try {
    await settled;
  } catch (error) {
    if (!isTimeout(error)) {
      store.abandonRead();
      throw error;
    }
    store.expireRead();
  }
  return lastRead(env);
}

function lootFor(
  { core }: Env,
  guid: bigint,
): { done: Promise<RewardsOpenLoot>; off: () => void } {
  const answer = Promise.withResolvers<RewardsOpenLoot>();
  const off = core.rewards.onEvent(({ type, state }) => {
    const { loot, lastOpenFailure, lastLootError } = state;
    if (type === "loot_opened" && loot.phase === "open" && loot.guid === guid)
      answer.resolve(loot);
    if (type === "loot_open_failed" && lastOpenFailure?.guid === guid)
      answer.reject(new Error(lastOpenFailure.reason));
    if (type === "loot_error" && lastLootError?.guid === guid)
      answer.reject(new Error(`loot_error_${lastLootError.error}`));
  });
  return { done: answer.promise, off };
}

async function open(env: Env, from: ItemPosition): Promise<RewardsOpenLoot> {
  const { ctx, store, core } = env;
  const item = held(env, from);
  const life = store.life();
  if (life !== "alive") throw new Error(`the character is ${life}`);
  if (core.rewards.loot.phase !== "closed" || core.rewards.pending)
    throw new Error("a loot window is already open");
  begin(env, "open", item);
  const { done, off } = lootFor(env, item.guid);
  core.rewards.requestOpen(item.guid);
  ctx.send(GameOpcode.CMSG_OPEN_ITEM, buildOpenItem(from));
  try {
    const loot = await bounded(done, ctx.signal, READ_ANSWER_MS, "timeout");
    store.settleOpen("ok");
    return loot;
  } catch (error) {
    if (isTimeout(error)) {
      store.expireRead();
      throw new Error("the open went unanswered", { cause: error });
    }
    if (ctx.signal.aborted) store.abandonRead();
    else store.settleOpen("failed", (error as Error).message);
    throw error;
  } finally {
    off();
  }
}

async function queryText(
  { ctx, store }: Env,
  guid: bigint,
): Promise<string | undefined> {
  const cached = store.text(guid);
  if (cached !== undefined) return cached;
  const { promise, first } = store.awaitText(guid);
  if (first)
    ctx.send(GameOpcode.CMSG_ITEM_TEXT_QUERY, buildItemTextQuery(guid));
  try {
    return await bounded(promise, ctx.signal, TEXT_ANSWER_MS, "timeout");
  } catch (error) {
    store.dropText(guid);
    if (isTimeout(error))
      throw new Error("the item text query went unanswered", {
        cause: error,
      });
    throw error;
  }
}

export function readActs(env: Env): ReadActs {
  return {
    open: (from) => open(env, from),
    read: (from) => read(env, from),
    queryText: (guid) => queryText(env, guid),
  };
}
