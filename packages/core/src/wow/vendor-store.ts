import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { EntityEvent, EntityLookup } from "#wow/entity-store";
import {
  type InventorySlot,
  type InventoryState,
  readInventory,
} from "#wow/inventory";
import {
  type InventoryChangeFailure,
  type InventoryClaim,
  InventoryResult,
} from "#wow/protocol/inventory";
import {
  type BuyItemFailure,
  type BuyItemResult,
  buyResultName,
  type SellItemFailure,
  sellResultName,
  type VendorInventory,
} from "#wow/protocol/vendor";
import type {
  RepairTarget,
  VendorEvent,
  VendorOutcome,
  VendorRequest,
  VendorState,
  VendorWindow,
} from "#wow/vendor";

export type VendorStoreDeps = {
  now: () => number;
  selfGuid: () => bigint;
  getEntity: EntityLookup;
};

type Settled = "listed" | "sold" | "bought" | "repaired";

type Occupied = Extract<InventorySlot, { status: "occupied" }>;

export function occupied(inventory: InventoryState, bag: number, slot: number) {
  return inventory.slots.find(
    (candidate): candidate is Occupied =>
      candidate.status === "occupied" &&
      candidate.bag === bag &&
      candidate.slot === slot,
  );
}

function inventoryReason(result: number): string {
  if (result === InventoryResult.INVENTORY_FULL) return "inventory_full";
  if (
    result === InventoryResult.BAG_FULL ||
    result === InventoryResult.BAG_FULL3
  )
    return "bag_full";
  return `inventory_result_${result}`;
}

function stillDamaged(
  inventory: InventoryState,
  damaged: RepairTarget[],
): RepairTarget[] {
  return damaged.filter((target) => {
    const held = occupied(inventory, target.bag, target.slot);
    if (held?.guid !== target.guid) return false;
    const { durability, maxDurability } = held.item;
    return durability === undefined || durability < (maxDurability ?? 0);
  });
}

function stackLeft(
  inventory: InventoryState,
  bag: number,
  slot: number,
  itemGuid: bigint,
): number {
  const held = occupied(inventory, bag, slot);
  return held?.guid === itemGuid ? (held.item.count ?? 1) : 0;
}

function settledBy(
  pending: VendorRequest,
  inventory: InventoryState,
): Settled | undefined {
  const { coinage } = inventory;
  const before = pending.coinageBefore;
  const delta =
    coinage === undefined || before === undefined ? 0 : coinage - before;
  switch (pending.action) {
    case "sell": {
      const { bag, slot, itemGuid, stackBefore, count } = pending;
      const left = stackLeft(inventory, bag, slot, itemGuid);
      return left === stackBefore - count && delta > 0 ? "sold" : undefined;
    }
    case "buy":
      return pending.answer && (pending.minPrice === 0 || delta < 0)
        ? "bought"
        : undefined;
    case "repair": {
      const fixed = stillDamaged(inventory, pending.damaged).length === 0;
      return fixed && delta < 0 ? "repaired" : undefined;
    }
    default:
      return;
  }
}

export class VendorStore {
  private readonly events = new Emitter<[VendorEvent]>();
  private readonly deps: VendorStoreDeps;
  private isDisposed = false;
  private listed: VendorWindow | undefined;
  private request: VendorRequest | undefined;
  private lastOutcome: VendorOutcome | undefined;

  constructor(deps: VendorStoreDeps) {
    this.deps = deps;
  }

  onEvent(listener: (event: VendorEvent) => void): Unsubscribe {
    return this.events.subscribe(listener);
  }

  get disposed(): boolean {
    return this.isDisposed;
  }

  get window(): VendorWindow | undefined {
    return this.listed;
  }

  get pending(): VendorRequest | undefined {
    return this.request;
  }

  snapshot(): VendorState {
    return {
      window: this.listed
        ? { ...this.listed, items: this.listed.items.map((i) => ({ ...i })) }
        : undefined,
      pending: this.request ? { ...this.request } : undefined,
      lastOutcome: this.lastOutcome ? { ...this.lastOutcome } : undefined,
      coinage: this.inventory().coinage,
      disposed: this.isDisposed,
    };
  }

  inventory(): InventoryState {
    return readInventory(this.deps.selfGuid(), this.deps.getEntity);
  }

  base(
    guid: bigint,
  ): Pick<VendorRequest, "guid" | "requestedAt" | "coinageBefore"> {
    return {
      guid,
      requestedAt: this.deps.now(),
      coinageBefore: this.inventory().coinage,
    };
  }

  begin(request: VendorRequest): VendorState {
    this.request = request;
    return this.emit(`${request.action}_requested`);
  }

  receiveInventory({ guid, items, emptyReason }: VendorInventory): void {
    if (this.isDisposed) return;
    const at = this.deps.now();
    this.listed = {
      guid,
      items,
      emptyReason,
      openedAt: at,
      invalidatedReason: undefined,
    };
    if (this.request?.action === "list" && this.request.guid === guid)
      this.settle("confirmed", undefined, "listed");
    else this.emit("listed");
  }

  receiveSellFailure({ itemGuid, result }: SellItemFailure): void {
    const pending = this.request;
    if (this.isDisposed || !pending) return;
    const own = pending.action === "sell" && pending.itemGuid === itemGuid;
    if (own || (itemGuid === 0n && pending.action !== "buy"))
      this.settle("refused", sellResultName(result), "refused");
  }

  receiveBuyItem(answer: BuyItemResult): void {
    const pending = this.request;
    if (this.isDisposed || pending?.action !== "buy") return;
    if (answer.vendorGuid !== pending.guid || answer.slot !== pending.slot)
      return;
    pending.answer = answer;
    const good = this.listed?.items.find((item) => item.slot === answer.slot);
    if (good) good.stock = answer.stock;
    this.check();
  }

  receiveBuyFailure({ itemId, result }: BuyItemFailure): void {
    const pending = this.request;
    if (this.isDisposed || pending?.action !== "buy") return;
    if (itemId === 0 || itemId === pending.itemId)
      this.settle("refused", buyResultName(result), "refused");
  }

  inventoryClaim(): InventoryClaim | undefined {
    return this.request?.action === "buy" ? { itemGuid: undefined } : undefined;
  }

  receiveInventoryFailure(packet: InventoryChangeFailure): void {
    if (this.isDisposed || this.request?.action !== "buy") return;
    if (packet.kind === "error")
      this.settle("refused", inventoryReason(packet.result), "refused");
  }

  observeEntity(event: EntityEvent): void {
    if (this.isDisposed) return;
    const window = this.listed;
    if (
      event.type === "disappear" &&
      window?.guid === event.guid &&
      !window.invalidatedReason
    ) {
      window.invalidatedReason = "vendor_unavailable";
      this.emit("invalidated");
    }
    if (this.request) this.check();
  }

  expire(): void {
    const pending = this.request;
    if (!pending) return;
    if (pending.action !== "repair") {
      this.settle("unanswered", "server_unanswered", "unanswered");
      return;
    }
    const left = stillDamaged(this.inventory(), pending.damaged);
    if (left.length < pending.damaged.length)
      this.settle("partial", "not_repaired", "partial");
    else this.settle("unanswered", "not_repaired", "unanswered");
  }

  dispose(): void {
    this.isDisposed = true;
    this.events.clear();
    this.listed = undefined;
    this.request = undefined;
    this.lastOutcome = undefined;
  }

  private check(): void {
    const pending = this.request;
    if (!pending) return;
    const settled = settledBy(pending, this.inventory());
    if (settled) this.settle("confirmed", undefined, settled);
  }

  private settle(
    status: VendorOutcome["status"],
    reason: string | undefined,
    type: VendorEvent["type"],
  ): void {
    const request = this.request;
    if (!request) return;
    const coinageAfter = this.inventory().coinage;
    const before = request.coinageBefore;
    this.lastOutcome = {
      action: request.action,
      status,
      reason,
      request,
      coinageAfter,
      moneyDelta:
        coinageAfter === undefined || before === undefined
          ? undefined
          : coinageAfter - before,
      observedAt: this.deps.now(),
    };
    this.request = undefined;
    this.emit(type);
  }

  private emit(type: VendorEvent["type"]): VendorState {
    const state = this.snapshot();
    this.events.emit({ type, at: this.deps.now(), state });
    return state;
  }
}
