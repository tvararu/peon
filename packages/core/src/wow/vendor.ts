import { Emitter, type Unsubscribe } from "#lib/emitter";
import { type EntityLookup, isUnit } from "#wow/entity-store";
import type { InventoryState } from "#wow/inventory";
import { readLife } from "#wow/player-state";
import { GameOpcode } from "#wow/protocol/opcodes";
import {
  type BuyItemResult,
  buildBuyItem,
  buildListInventory,
  buildRepairAll,
  buildSellItem,
  type VendorGood,
} from "#wow/protocol/vendor";
import { occupied, type VendorStore } from "#wow/vendor-store";

export type VendorDeps = {
  send: (opcode: number, body?: Uint8Array) => void;
  now: () => number;
  selfGuid: () => bigint;
  getEntity: EntityLookup;
};

export const VENDOR_ANSWER_MS = 5000;
const NPC_FLAG_VENDOR = 0x80;
const NPC_FLAG_REPAIR = 0x10_00;

export type VendorWindow = {
  guid: bigint;
  items: VendorGood[];
  emptyReason: number | undefined;
  openedAt: number;
  invalidatedReason: string | undefined;
};

type RequestBase = {
  guid: bigint;
  requestedAt: number;
  coinageBefore: number | undefined;
};
export type RepairTarget = {
  bag: number;
  slot: number;
  guid: bigint;
  durability: number;
  maxDurability: number;
};
export type VendorRequest = RequestBase &
  (
    | { action: "list" }
    | {
        action: "sell";
        itemGuid: bigint;
        bag: number;
        slot: number;
        itemId: number | undefined;
        count: number;
        stackBefore: number;
      }
    | {
        action: "buy";
        slot: number;
        itemId: number;
        count: number;
        minPrice: number;
        maxPrice: number;
        answer: BuyItemResult | undefined;
      }
    | { action: "repair"; damaged: RepairTarget[] }
  );

export type VendorOutcome = {
  action: VendorRequest["action"];
  status: "confirmed" | "refused" | "partial" | "unanswered";
  reason: string | undefined;
  request: VendorRequest;
  coinageAfter: number | undefined;
  moneyDelta: number | undefined;
  observedAt: number;
};

export type VendorState = {
  window: VendorWindow | undefined;
  pending: VendorRequest | undefined;
  lastOutcome: VendorOutcome | undefined;
  coinage: number | undefined;
  disposed: boolean;
};

type Settled = "listed" | "sold" | "bought" | "repaired";
export type VendorEvent = {
  type:
    | `${VendorRequest["action"]}_requested`
    | Settled
    | "refused"
    | "partial"
    | "unanswered"
    | "invalidated";
  at: number;
  state: VendorState;
};

function damagedItems(inventory: InventoryState): RepairTarget[] {
  return inventory.slots.flatMap((slot) => {
    if (slot.status !== "occupied") return [];
    const { durability, maxDurability } = slot.item;
    if (!maxDurability || durability === undefined) return [];
    if (durability >= maxDurability) return [];
    const { bag, guid } = slot;
    return [{ bag, slot: slot.slot, guid, durability, maxDurability }];
  });
}

export class VendorRuntime {
  private readonly events = new Emitter<[VendorEvent]>();
  private readonly store: VendorStore;
  private readonly deps: VendorDeps;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(store: VendorStore, deps: VendorDeps) {
    this.store = store;
    this.deps = deps;
    store.onEvent((event) => {
      this.events.emit(event);
      this.react(event);
    });
  }

  onEvent(listener: (event: VendorEvent) => void): Unsubscribe {
    if (this.disposed || this.store.disposed) return () => undefined;
    return this.events.subscribe(listener);
  }

  snapshot(): VendorState {
    return this.store.snapshot();
  }

  list(guid: bigint): VendorState {
    this.ready();
    const vendor = this.deps.getEntity(guid);
    if (!(isUnit(vendor) && vendor.npcFlags & NPC_FLAG_VENDOR))
      throw new Error("Creature is not an observed vendor");
    this.deps.send(GameOpcode.CMSG_LIST_INVENTORY, buildListInventory(guid));
    return this.store.begin({ action: "list", ...this.store.base(guid) });
  }

  sell(bag: number, slot: number, count?: number): VendorState {
    const window = this.openWindow();
    const held = occupied(this.store.inventory(), bag, slot);
    if (!held || (held.region !== "backpack" && held.region !== "bag_item"))
      throw new Error(`No carried bag item at bag ${bag} slot ${slot}`);
    const stackBefore = held.item.count ?? 1;
    const sold = count ?? stackBefore;
    if (sold > stackBefore) throw new Error("Sell count exceeds the stack");
    this.deps.send(
      GameOpcode.CMSG_SELL_ITEM,
      buildSellItem(window.guid, held.guid, sold),
    );
    return this.store.begin({
      action: "sell",
      ...this.store.base(window.guid),
      itemGuid: held.guid,
      bag,
      slot,
      itemId: held.item.entry,
      count: sold,
      stackBefore,
    });
  }

  buy(slot: number, count = 1): VendorState {
    const window = this.openWindow();
    const good = window.items.find((offered) => offered.slot === slot);
    if (!good) throw new Error("Vendor slot was not offered");
    this.deps.send(
      GameOpcode.CMSG_BUY_ITEM,
      buildBuyItem(window.guid, good.itemId, slot, count),
    );
    return this.store.begin({
      action: "buy",
      ...this.store.base(window.guid),
      slot,
      itemId: good.itemId,
      count,
      minPrice: good.price * count,
      maxPrice:
        good.price * count +
        (good.price > 0 || good.extendedCost === 0 ? count - 1 : 0),
      answer: undefined,
    });
  }

  repair(): VendorState {
    const window = this.openWindow();
    const vendor = this.deps.getEntity(window.guid);
    if (!(isUnit(vendor) && vendor.npcFlags & NPC_FLAG_REPAIR))
      throw new Error("Vendor does not repair");
    const damaged = damagedItems(this.store.inventory());
    if (damaged.length === 0) throw new Error("Nothing needs repair");
    this.deps.send(GameOpcode.CMSG_REPAIR_ITEM, buildRepairAll(window.guid));
    return this.store.begin({
      action: "repair",
      ...this.store.base(window.guid),
      damaged,
    });
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.events.clear();
  }

  private react(event: VendorEvent): void {
    if (event.type.endsWith("_requested")) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.store.expire(), VENDOR_ANSWER_MS);
    } else if (!event.state.pending) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private ready(): void {
    if (this.disposed || this.store.disposed)
      throw new Error("Vendor runtime disposed");
    const self = this.deps.selfGuid();
    if (!self) throw new Error("Authenticated player GUID is unknown");
    if (readLife(self, this.deps.getEntity).life !== "alive")
      throw new Error("Vendor action requires authoritative alive state");
    if (this.store.pending)
      throw new Error("Previous vendor request remains unanswered");
  }

  private openWindow(): VendorWindow {
    this.ready();
    const { window } = this.store;
    if (!window) throw new Error("No listed vendor");
    if (window.invalidatedReason)
      throw new Error(`Vendor is unavailable: ${window.invalidatedReason}`);
    return window;
  }
}
