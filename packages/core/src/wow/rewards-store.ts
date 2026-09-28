import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { EntityEvent, EntityLookup } from "#wow/entity-store";
import { type InventoryState, readInventory } from "#wow/inventory";
import { LootRolls } from "#wow/loot-rolls";
import { readLife } from "#wow/player-state";
import {
  type InventoryChangeFailure,
  type InventoryClaim,
  InventoryResult,
} from "#wow/protocol/inventory";
import type {
  ItemPushResult,
  LootMoneyNotify,
  LootReleaseResponse,
  LootRemoved,
  LootResponse,
} from "#wow/protocol/loot";
import type {
  RewardsEvent,
  RewardsInventoryError,
  RewardsItemPush,
  RewardsLoot,
  RewardsLootError,
  RewardsMoneyNotice,
  RewardsOpenFailure,
  RewardsOpenLoot,
  RewardsRelease,
  RewardsRequest,
  RewardsState,
} from "#wow/rewards";

export type RewardsStoreDeps = {
  now: () => number;
  selfGuid: () => bigint;
  getEntity: EntityLookup;
};

function holdsItem(inventory: InventoryState, guid: bigint): boolean {
  return inventory.slots.some(
    (slot) => slot.status === "occupied" && slot.guid === guid,
  );
}

function copyLoot(loot: RewardsLoot): RewardsLoot {
  if (loot.phase === "open" || loot.phase === "closing")
    return { ...loot, items: loot.items.map((item) => ({ ...item })) };
  return { ...loot };
}

function copyInventoryError(
  error: RewardsInventoryError | undefined,
): RewardsInventoryError | undefined {
  if (!error) return undefined;
  return {
    ...error,
    packet: { ...error.packet, detail: { ...error.packet.detail } },
  };
}

export class RewardsStore {
  private readonly events = new Emitter<[RewardsEvent]>();
  private isDisposed = false;
  private selfUnavailable = false;
  private lootWindow: RewardsLoot = { phase: "closed" };
  private request: RewardsRequest | undefined;
  private lastLootError: RewardsLootError | undefined;
  private lastOpenFailure: RewardsOpenFailure | undefined;
  private lastInventoryError: RewardsInventoryError | undefined;
  private lastItemPush: RewardsItemPush | undefined;
  private lastMoneyNotice: RewardsMoneyNotice | undefined;
  private lastRelease: RewardsRelease | undefined;
  private lastInventory: InventoryState | undefined;
  private readonly deps: RewardsStoreDeps;
  readonly rolls: LootRolls;

  constructor(deps: RewardsStoreDeps) {
    this.deps = deps;
    this.rolls = new LootRolls({
      changed: (type) => {
        if (!this.isDisposed) this.emit(type);
      },
      lootGuid: () =>
        this.lootWindow.phase === "closed" ? undefined : this.lootWindow.guid,
      now: deps.now,
      selfGuid: deps.selfGuid,
    });
  }

  onEvent(listener: (event: RewardsEvent) => void): Unsubscribe {
    return this.events.subscribe(listener);
  }

  get disposed(): boolean {
    return this.isDisposed;
  }

  get loot(): RewardsLoot {
    return this.lootWindow;
  }

  get pending(): RewardsRequest | undefined {
    return this.request;
  }

  selfAlive(): boolean {
    return (
      !this.selfUnavailable &&
      readLife(this.deps.selfGuid(), this.deps.getEntity).life === "alive"
    );
  }

  resetInventoryBaseline(): void {
    this.lastInventory = undefined;
  }

  snapshot(): RewardsState {
    return {
      loot: copyLoot(this.lootWindow),
      pending: this.request ? { ...this.request } : undefined,
      inventory: this.inventory(),
      lastLootError: this.lastLootError ? { ...this.lastLootError } : undefined,
      lastOpenFailure: this.lastOpenFailure
        ? { ...this.lastOpenFailure }
        : undefined,
      lastInventoryError: copyInventoryError(this.lastInventoryError),
      lastItemPush: this.lastItemPush ? { ...this.lastItemPush } : undefined,
      lastMoneyNotice: this.lastMoneyNotice
        ? { ...this.lastMoneyNotice }
        : undefined,
      lastRelease: this.lastRelease ? { ...this.lastRelease } : undefined,
      rolls: this.rolls.snapshot(),
      disposed: this.isDisposed,
    };
  }

  requestOpen(guid: bigint): RewardsState {
    const requestedAt = this.deps.now();
    this.lastOpenFailure = undefined;
    this.lootWindow = {
      phase: "opening",
      guid,
      requestedAt,
      invalidatedReason: undefined,
    };
    this.request = { action: "open", guid, requestedAt, status: "unanswered" };
    return this.emit("loot_open_requested");
  }

  requestTake(guid: bigint, slot: number): RewardsState {
    const requestedAt = this.deps.now();
    this.request = {
      action: "take",
      guid,
      slot,
      requestedAt,
      status: "unanswered",
    };
    return this.emit("loot_take_requested");
  }

  requestMoney(guid: bigint): RewardsState {
    const requestedAt = this.deps.now();
    this.request = { action: "money", guid, requestedAt, status: "unanswered" };
    return this.emit("loot_money_requested");
  }

  requestClose(window: RewardsOpenLoot): RewardsState {
    const requestedAt = this.deps.now();
    window.phase = "closing";
    this.request = {
      action: "close",
      guid: window.guid,
      requestedAt,
      status: "unanswered",
    };
    return this.emit("loot_close_requested");
  }

  failOpen(reason: string): void {
    if (this.lootWindow.phase !== "opening") return;
    this.lastOpenFailure = {
      guid: this.lootWindow.guid,
      reason,
      observedAt: this.deps.now(),
    };
    this.lootWindow = { phase: "closed" };
    this.request = undefined;
    this.emit("loot_open_failed");
  }

  receiveLootResponse(response: LootResponse): void {
    if (this.isDisposed) return;
    const loot = this.lootWindow;
    if (loot.phase === "closed" || response.guid !== loot.guid) return;
    if (response.kind === "error") {
      this.lastLootError = {
        guid: response.guid,
        error: response.error,
        observedAt: this.deps.now(),
      };
      if (loot.phase === "opening") this.lootWindow = { phase: "closed" };
      if (this.request?.action !== "close") this.request = undefined;
      this.emit("loot_error");
      return;
    }
    if (loot.phase !== "opening") return;
    this.lootWindow = {
      phase: "open",
      guid: response.guid,
      lootType: response.lootType,
      money: response.money,
      items: response.items,
      openedAt: this.deps.now(),
      invalidatedReason: loot.invalidatedReason,
    };
    this.request = undefined;
    this.rolls.observeOffer(response.guid, response.items);
    this.emit("loot_opened");
  }

  receiveLootRemoved({ slot }: LootRemoved): void {
    if (this.isDisposed) return;
    const loot = this.lootWindow;
    if (loot.phase !== "open" && loot.phase !== "closing") return;
    const index = loot.items.findIndex((item) => item.slot === slot);
    if (index < 0) return;
    loot.items.splice(index, 1);
    if (this.request?.action === "take" && this.request.slot === slot)
      this.request = undefined;
    this.emit("loot_removed");
  }

  receiveLootMoneyCleared(): void {
    if (this.isDisposed) return;
    const loot = this.lootWindow;
    if (loot.phase !== "open" && loot.phase !== "closing") return;
    loot.money = 0;
    if (this.request?.action === "money") this.request = undefined;
    this.emit("loot_money_cleared");
  }

  receiveLootRelease(response: LootReleaseResponse): void {
    if (this.isDisposed) return;
    const loot = this.lootWindow;
    if (loot.phase === "closed" || response.guid !== loot.guid) return;
    this.lastRelease = { ...response, observedAt: this.deps.now() };
    if (response.status === 1 && loot.phase !== "opening") {
      this.lootWindow = { phase: "closed" };
      this.request = undefined;
    }
    this.emit("loot_release_observed");
  }

  receiveMoneyNotice(notice: LootMoneyNotify): void {
    if (this.isDisposed) return;
    if (!this.deps.selfGuid()) return;
    this.lastMoneyNotice = { ...notice, observedAt: this.deps.now() };
    this.emit("money_notice");
  }

  receiveItemPush(push: ItemPushResult): void {
    if (this.isDisposed) return;
    const selfGuid = this.deps.selfGuid();
    if (!selfGuid || push.guid !== selfGuid) return;
    this.lastItemPush = { ...push, observedAt: this.deps.now() };
    this.emit("item_push");
  }

  inventoryClaim(): InventoryClaim | undefined {
    return this.request?.action === "take"
      ? { itemGuid: undefined }
      : undefined;
  }

  receiveInventoryFailure(packet: InventoryChangeFailure, owned = true): void {
    if (this.isDisposed) return;
    if (packet.kind === "ok") {
      this.lastInventoryError = undefined;
      this.emit("inventory_result");
      return;
    }
    this.lastInventoryError = {
      packet,
      inventoryFull: packet.result === InventoryResult.INVENTORY_FULL,
      bagFull:
        packet.result === InventoryResult.BAG_FULL ||
        packet.result === InventoryResult.BAG_FULL3,
      observedAt: this.deps.now(),
    };
    if (owned && this.request?.action === "take") this.request = undefined;
    this.emit("inventory_error");
  }

  observeEntity(event: EntityEvent): void {
    if (this.isDisposed) return;
    const guid = event.type === "disappear" ? event.guid : event.entity.guid;
    if (guid === this.deps.selfGuid()) this.observeSelf(event);
    if (
      event.type === "disappear" &&
      this.lootWindow.phase !== "closed" &&
      guid === this.lootWindow.guid
    )
      this.invalidate("loot_source_unavailable");
    if (this.events.size === 0) return;
    this.observeInventory(guid);
  }

  dispose(): void {
    this.isDisposed = true;
    this.events.clear();
    this.selfUnavailable = true;
    this.lootWindow = { phase: "closed" };
    this.request = undefined;
    this.lastLootError = undefined;
    this.lastInventoryError = undefined;
    this.lastItemPush = undefined;
    this.lastMoneyNotice = undefined;
    this.lastRelease = undefined;
    this.lastOpenFailure = undefined;
    this.lastInventory = undefined;
    this.rolls.clear();
  }

  private observeSelf(event: EntityEvent): void {
    if (event.type === "disappear") this.selfUnavailable = true;
    else if (event.type === "appear") this.selfUnavailable = false;
    if (!this.selfAlive()) this.invalidate("self_unavailable");
  }

  private observeInventory(guid: bigint): void {
    const previous = this.lastInventory;
    if (guid !== this.deps.selfGuid() && previous && !holdsItem(previous, guid))
      return;
    const inventory = this.inventory();
    this.lastInventory = inventory;
    if (guid !== this.deps.selfGuid() && !holdsItem(inventory, guid)) return;
    if (previous && Bun.deepEquals(inventory, previous, true)) return;
    this.emit("inventory_observed");
  }

  private inventory(): InventoryState {
    const selfGuid = this.deps.selfGuid();
    if (this.selfUnavailable || this.isDisposed)
      return {
        selfGuid,
        scope: "carried",
        status: "unknown",
        coinage: undefined,
        slots: [],
        bags: [],
        freeSlots: undefined,
        issues: [],
      };
    return readInventory(selfGuid, this.deps.getEntity);
  }

  private invalidate(reason: string): void {
    const loot = this.lootWindow;
    if (loot.phase === "opening") {
      this.failOpen(reason);
      return;
    }
    if (loot.phase === "closed" || loot.invalidatedReason) return;
    loot.invalidatedReason = reason;
    this.emit("loot_invalidated");
  }

  private emit(type: RewardsEvent["type"]): RewardsState {
    const state = this.snapshot();
    this.events.emit({ type, at: this.deps.now(), state });
    return state;
  }
}
