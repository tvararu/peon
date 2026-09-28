import { Emitter, type Unsubscribe } from "#lib/emitter";
import { type InventoryState, readInventory } from "#wow/inventory";
import {
  type InventoryChangeFailure,
  type InventoryClaim,
  inventoryResultName,
  ownsInventoryFailure,
} from "#wow/protocol/inventory";
import {
  type BuyItemFailure,
  type BuyItemResult,
  buyResultName,
  type SellItemFailure,
  sellResultName,
} from "#wow/protocol/vendor";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type BuybackEntry = {
  slot: number;
  guid: bigint;
  entry: number | undefined;
  count: number | undefined;
  price: number | undefined;
  soldAt: number | undefined;
};

export type BuybackRequest =
  | {
      kind: "buyback";
      vendor: bigint;
      slot: number;
      guid: bigint;
      entry: number | undefined;
      coinageBefore: number | undefined;
      requestedAt: number;
    }
  | {
      kind: "buy_in_slot";
      vendor: bigint;
      vendorSlot: number;
      itemId: number;
      bag: number;
      slot: number;
      count: number;
      requestedAt: number;
    };

export type BuybackResult =
  | { status: "ok" }
  | { status: "refused"; reason: string }
  | { status: "unanswered" };

export type BuybackOutcome = BuybackResult & {
  request: BuybackRequest;
  observedAt: number;
};

export type BuybackState = {
  list: BuybackEntry[];
  pending: BuybackRequest | undefined;
  lastOutcome: BuybackOutcome | undefined;
};

export type BuybackEvent =
  | { type: "listed"; list: BuybackEntry[] }
  | {
      type: "bought_back";
      slot: number;
      guid: bigint;
      entry: number | undefined;
    }
  | {
      type: "bought_in_slot";
      itemId: number;
      vendorSlot: number;
      bag: number;
      slot: number;
      count: number;
    }
  | { type: "refused"; kind: BuybackRequest["kind"]; reason: string }
  | { type: "unanswered"; kind: BuybackRequest["kind"] };

type Seen = { entry: number; count: number | undefined };

const MEMORY = 256;
const UNCLAIMED: InventoryClaim = { itemGuid: undefined };

function legacyClaims(core: CoreStores): (InventoryClaim | undefined)[] {
  const destroy = core.destroy.pending;
  const buy = core.vendor.pending?.action === "buy";
  const quest = core.quests.pending?.action;
  const take = core.rewards.pending?.action === "take";
  return [
    destroy && { itemGuid: destroy.itemGuid },
    buy ? UNCLAIMED : undefined,
    quest === "accept" || quest === "chooseReward" ? UNCLAIMED : undefined,
    take ? UNCLAIMED : undefined,
  ];
}

const listKey = (list: readonly BuybackEntry[]) =>
  list
    .map((e) => `${e.slot}:${e.guid}:${e.entry}:${e.price}:${e.soldAt}`)
    .join(",");

export class BuybackStore {
  private readonly events = new Emitter<[BuybackEvent]>();
  private readonly deps: SessionDeps;
  private readonly core: CoreStores;
  private readonly seen = new Map<bigint, Seen>();
  private request: BuybackRequest | undefined;
  private last: BuybackOutcome | undefined;
  private shown = "";

  constructor(deps: SessionDeps, core: CoreStores) {
    this.deps = deps;
    this.core = core;
  }

  snapshot(): BuybackState {
    return {
      list: this.list(this.inventory()),
      pending: this.request,
      lastOutcome: this.last,
    };
  }

  onEvent(cb: (event: BuybackEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  inventory(): InventoryState {
    return readInventory(this.deps.selfGuid(), this.deps.getEntity);
  }

  begin(request: BuybackRequest): void {
    this.request = request;
    this.last = undefined;
  }

  observeInventory(): void {
    const inventory = this.inventory();
    this.remember(inventory);
    const list = this.list(inventory);
    const key = listKey(list);
    const request = this.request;
    if (request?.kind === "buyback" && this.boughtBack(request, inventory))
      this.settle(
        { status: "ok" },
        {
          type: "bought_back",
          slot: request.slot,
          guid: request.guid,
          entry: request.entry,
        },
      );
    if (key === this.shown) return;
    this.shown = key;
    this.events.emit({ type: "listed", list });
  }

  receiveBuyItem(answer: BuyItemResult): void {
    const request = this.request;
    if (request?.kind !== "buy_in_slot") return;
    if (answer.vendorGuid !== request.vendor) return;
    if (answer.slot !== request.vendorSlot) return;
    const { itemId, vendorSlot, bag, slot, count } = request;
    this.settle(
      { status: "ok" },
      {
        type: "bought_in_slot",
        itemId,
        vendorSlot,
        bag,
        slot,
        count,
      },
    );
  }

  receiveBuyFailure(failure: BuyItemFailure): void {
    const request = this.request;
    if (!request) return;
    if (failure.vendorGuid !== 0n && failure.vendorGuid !== request.vendor)
      return;
    const wanted = request.kind === "buyback" ? request.entry : request.itemId;
    const mine =
      failure.itemId === 0 || wanted === undefined || failure.itemId === wanted;
    if (mine) this.refuse(buyResultName(failure.result));
  }

  receiveSellFailure(failure: SellItemFailure): void {
    if (this.request?.kind !== "buyback" || failure.itemGuid !== 0n) return;
    this.refuse(sellResultName(failure.result));
  }

  receiveInventoryFailure(packet: InventoryChangeFailure): void {
    const request = this.request;
    if (!request || packet.kind !== "error") return;
    const mine =
      request.kind === "buyback" ? { itemGuid: request.guid } : UNCLAIMED;
    if (!ownsInventoryFailure(packet, mine, legacyClaims(this.core))) return;
    this.refuse(inventoryResultName(packet.result));
  }

  expire(): void {
    const request = this.request;
    if (!request) return;
    this.settle(
      { status: "unanswered" },
      {
        type: "unanswered",
        kind: request.kind,
      },
    );
  }

  abandon(): void {
    this.request = undefined;
  }

  dispose(): void {
    this.abandon();
    this.seen.clear();
    this.events.clear();
  }

  private list(inventory: InventoryState): BuybackEntry[] {
    return (inventory.buyback ?? []).map(({ slot, guid, price, soldAt }) => {
      const known = this.seen.get(guid);
      return {
        slot,
        guid,
        entry: known?.entry,
        count: known?.count,
        price,
        soldAt,
      };
    });
  }

  private remember(inventory: InventoryState): void {
    for (const held of inventory.slots) {
      if (held.status !== "occupied" || held.item.entry === undefined) continue;
      this.seen.delete(held.guid);
      this.seen.set(held.guid, {
        entry: held.item.entry,
        count: held.item.count,
      });
    }
    for (const guid of this.seen.keys()) {
      if (this.seen.size <= MEMORY) break;
      this.seen.delete(guid);
    }
  }

  private boughtBack(
    request: Extract<BuybackRequest, { kind: "buyback" }>,
    inventory: InventoryState,
  ): boolean {
    const still = (inventory.buyback ?? []).some(
      (held) => held.slot === request.slot && held.guid === request.guid,
    );
    if (still) return false;
    const carried = inventory.slots.some(
      (held) => held.status === "occupied" && held.guid === request.guid,
    );
    const { coinage } = inventory;
    const paid =
      coinage !== undefined &&
      request.coinageBefore !== undefined &&
      coinage < request.coinageBefore;
    return carried || paid;
  }

  private refuse(reason: string): void {
    const request = this.request;
    if (!request) return;
    this.settle(
      { status: "refused", reason },
      {
        type: "refused",
        kind: request.kind,
        reason,
      },
    );
  }

  private settle(result: BuybackResult, event: BuybackEvent): void {
    const request = this.request;
    if (!request) return;
    this.last = { ...result, request, observedAt: this.deps.now() };
    this.request = undefined;
    this.events.emit(event);
  }
}
