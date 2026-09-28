import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  DestroyEvent,
  DestroyOutcome,
  DestroyRequest,
  DestroyState,
} from "#wow/destroy";
import type { EntityLookup } from "#wow/entity-store";
import {
  type InventorySlot,
  type InventoryState,
  readInventory,
} from "#wow/inventory";
import {
  type InventoryChangeFailure,
  type InventoryClaim,
  inventoryResultName,
} from "#wow/protocol/inventory";

export type DestroyStoreDeps = {
  now: () => number;
  selfGuid: () => bigint;
  getEntity: EntityLookup;
};

type Occupied = Extract<InventorySlot, { status: "occupied" }>;

function stackAt(inventory: InventoryState, request: DestroyRequest): number {
  const held = inventory.slots.find(
    (slot): slot is Occupied =>
      slot.status === "occupied" &&
      slot.bag === request.bag &&
      slot.slot === request.slot,
  );
  return held?.guid === request.itemGuid ? (held.item.count ?? 1) : 0;
}

export class DestroyStore {
  private readonly events = new Emitter<[DestroyEvent]>();
  private readonly deps: DestroyStoreDeps;
  private isDisposed = false;
  private request: DestroyRequest | undefined;
  private lastOutcome: DestroyOutcome | undefined;

  constructor(deps: DestroyStoreDeps) {
    this.deps = deps;
  }

  onEvent(listener: (event: DestroyEvent) => void): Unsubscribe {
    return this.events.subscribe(listener);
  }

  get disposed(): boolean {
    return this.isDisposed;
  }

  get pending(): DestroyRequest | undefined {
    return this.request;
  }

  inventoryClaim(): InventoryClaim | undefined {
    return this.request && { itemGuid: this.request.itemGuid };
  }

  snapshot(): DestroyState {
    return {
      pending: this.request ? { ...this.request } : undefined,
      lastOutcome: this.lastOutcome ? { ...this.lastOutcome } : undefined,
    };
  }

  inventory(): InventoryState {
    return readInventory(this.deps.selfGuid(), this.deps.getEntity);
  }

  begin(request: DestroyRequest): DestroyState {
    this.request = request;
    return this.emit("requested");
  }

  receiveInventoryFailure(packet: InventoryChangeFailure): void {
    if (this.isDisposed || !this.request || packet.kind !== "error") return;
    this.settle("refused", inventoryResultName(packet.result));
  }

  observeInventory(): void {
    const pending = this.request;
    if (this.isDisposed || !pending) return;
    const left = stackAt(this.inventory(), pending);
    if (left === pending.stackBefore - pending.count)
      this.settle("confirmed", undefined);
  }

  expire(): void {
    this.settle("unanswered", "server_unanswered");
  }

  dispose(): void {
    this.isDisposed = true;
    this.events.clear();
    this.request = undefined;
    this.lastOutcome = undefined;
  }

  private settle(status: DestroyOutcome["status"], reason?: string): void {
    const request = this.request;
    if (!request) return;
    this.lastOutcome = {
      status,
      reason,
      request,
      stackAfter: stackAt(this.inventory(), request),
      observedAt: this.deps.now(),
    };
    this.request = undefined;
    this.emit(status === "confirmed" ? "destroyed" : status);
  }

  private emit(type: DestroyEvent["type"]): DestroyState {
    const state = this.snapshot();
    this.events.emit({ type, at: this.deps.now(), state });
    return state;
  }
}
