import {
  buildBuybackItem,
  buildBuyItemInSlot,
  isBuybackSlot,
} from "#wow/areas/buyback/protocol";
import type {
  BuybackEvent,
  BuybackRequest,
  BuybackResult,
  BuybackStore,
} from "#wow/areas/buyback/store";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import type { InventoryState } from "#wow/inventory";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";
import type { VendorWindow } from "#wow/vendor";

export const BUYBACK_ANSWER_MS = 5000;

const BACKPACK = 255;
const PACK_FIRST = 23;
const PACK_LAST = 38;
const BAG_FIRST = 19;
const BAG_LAST = 22;

export type BuyInSlot = {
  vendorSlot: number;
  bag: number;
  slot: number;
  count: number;
};

export type BuybackActs = {
  buyback: (slot: number) => Promise<BuybackResult>;
  buyInSlot: (buy: BuyInSlot) => Promise<BuybackResult>;
};

const SETTLED = new Set<BuybackEvent["type"]>([
  "bought_back",
  "bought_in_slot",
  "refused",
  "unanswered",
]);

type Env = {
  ctx: AreaRuntimeCtx<BuybackEvent>;
  store: BuybackStore;
  core: CoreStores;
};

type Ready = { inventory: InventoryState; window: VendorWindow };

function ready({ ctx, store, core }: Env): Ready {
  const inventory = store.inventory();
  if (!ctx.selfGuid() || inventory.status === "unknown")
    throw new Error("the character is not in world");
  const window = core.vendor.window;
  if (!window || window.invalidatedReason)
    throw new Error("no vendor window is open");
  if (core.vendor.pending) throw new Error("a vendor request is still pending");
  if (store.snapshot().pending)
    throw new Error("a buyback or slot purchase is already pending");
  return { inventory, window };
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

function outcome(store: BuybackStore): BuybackResult {
  const last = store.snapshot().lastOutcome;
  if (!last) return { status: "unanswered" };
  if (last.status === "refused")
    return { status: "refused", reason: last.reason };
  return { status: last.status };
}

async function wait(env: Env, settled: Promise<BuybackEvent>) {
  try {
    await settled;
  } catch (error) {
    if (!isTimeout(error)) {
      env.store.abandon();
      throw error;
    }
    env.store.expire();
  }
  return outcome(env.store);
}

function run(
  env: Env,
  request: BuybackRequest,
  packet: readonly [opcode: number, body: Uint8Array],
): Promise<BuybackResult> {
  env.store.begin(request);
  const settled = env.ctx.until((event) => SETTLED.has(event.type), {
    timeoutMs: BUYBACK_ANSWER_MS,
  });
  env.ctx.send(...packet);
  return wait(env, settled);
}

function buyback(env: Env, slot: number): Promise<BuybackResult> {
  if (!isBuybackSlot(slot))
    throw new Error(`buyback slot ${slot} is not in 74-85`);
  const { inventory, window } = ready(env);
  const held = inventory.buyback?.find((sold) => sold.slot === slot);
  if (!held) throw new Error(`buyback slot ${slot} is empty`);
  const { coinage } = inventory;
  if (held.price !== undefined && coinage !== undefined && held.price > coinage)
    throw new Error(
      `buyback slot ${slot} costs ${held.price}, above the coinage ${coinage}`,
    );
  const entry = env.store.snapshot().list.find((e) => e.slot === slot)?.entry;
  return run(
    env,
    {
      kind: "buyback",
      vendor: window.guid,
      slot,
      guid: held.guid,
      entry,
      coinageBefore: coinage,
      requestedAt: env.ctx.now(),
    },
    [GameOpcode.CMSG_BUYBACK_ITEM, buildBuybackItem(window.guid, slot)],
  );
}

function bagGuid(env: Env, inventory: InventoryState, buy: BuyInSlot): bigint {
  if (buy.bag === BACKPACK) {
    if (buy.slot < PACK_FIRST || buy.slot > PACK_LAST)
      throw new Error(`backpack slots are ${PACK_FIRST}-${PACK_LAST}`);
    return env.ctx.selfGuid();
  }
  const bag = inventory.bags.find((known) => known.slot === buy.bag);
  if (buy.bag < BAG_FIRST || buy.bag > BAG_LAST || !bag?.guid)
    throw new Error(`bag ${buy.bag} holds no bag`);
  if (bag.size === undefined || buy.slot < 0 || buy.slot >= bag.size)
    throw new Error(`bag ${buy.bag} slot ${buy.slot} is outside the bag`);
  return bag.guid;
}

function buyInSlot(env: Env, buy: BuyInSlot): Promise<BuybackResult> {
  const { inventory, window } = ready(env);
  const good = window.items.find((item) => item.slot === buy.vendorSlot);
  if (!good) throw new Error(`vendor slot ${buy.vendorSlot} is not listed`);
  if (!Number.isInteger(buy.count) || buy.count < 1 || buy.count > 255)
    throw new Error("count must be 1 to 255");
  const guid = bagGuid(env, inventory, buy);
  const there = inventory.slots.find(
    (held) => held.bag === buy.bag && held.slot === buy.slot,
  );
  if (there?.status !== "empty")
    throw new Error(`bag ${buy.bag} slot ${buy.slot} is not empty`);
  return run(
    env,
    {
      kind: "buy_in_slot",
      vendor: window.guid,
      vendorSlot: buy.vendorSlot,
      itemId: good.itemId,
      bag: buy.bag,
      slot: buy.slot,
      count: buy.count,
      requestedAt: env.ctx.now(),
    },
    [
      GameOpcode.CMSG_BUY_ITEM_IN_SLOT,
      buildBuyItemInSlot({
        vendor: window.guid,
        item: good.itemId,
        vendorSlot: buy.vendorSlot,
        bagGuid: guid,
        bagSlot: buy.slot,
        count: buy.count,
      }),
    ],
  );
}

const INVENTORY_TYPES = new Set<number>([
  ObjectType.PLAYER,
  ObjectType.ITEM,
  ObjectType.CONTAINER,
]);

export function buybackRuntime(
  ctx: AreaRuntimeCtx<BuybackEvent>,
  store: BuybackStore,
  core: CoreStores,
): AreaRuntime<BuybackActs> {
  const env = { ctx, store, core };
  const off = ctx.listen("entity", (event) => {
    const type =
      event.type === "disappear" ? undefined : event.entity?.objectType;
    if (type === undefined || INVENTORY_TYPES.has(type))
      store.observeInventory();
  });
  return {
    act: {
      buyback: (slot) => buyback(env, slot),
      buyInSlot: (buy) => buyInSlot(env, buy),
    },
    dispose: off,
  };
}
