import { Emitter, type Unsubscribe } from "#lib/emitter";
import {
  type MoveKind,
  type MoveOutcome,
  type MoveRequest,
  type MoveState,
  moveSettled,
} from "#wow/areas/items/moves";
import { type InventoryState, readInventory } from "#wow/inventory";
import { type PlayerLife, readLife } from "#wow/player-state";
import {
  type InventoryChangeFailure,
  type InventoryClaim,
  inventoryResultName,
  isNoChange,
  ownsInventoryFailure,
} from "#wow/protocol/inventory";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type ItemsState = { move: MoveState };

type MoveHead = { kind: MoveKind; itemGuid: bigint; entry: number | undefined };
export type ItemReceived = {
  entry: number;
  guid: bigint | undefined;
  itemLevel: number;
  inventoryType: number;
  wornItemLevel: number | undefined;
};
export type ItemsEvent =
  | ({ type: "move_requested" } & MoveHead)
  | ({ type: "moved" } & MoveHead)
  | ({ type: "move_refused"; reason: string; result: number } & MoveHead)
  | ({ type: "move_no_change" } & MoveHead)
  | ({ type: "move_unanswered" } & MoveHead)
  | ({ type: "item_received" } & ItemReceived);

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

const head = ({ kind, itemGuid, entry }: MoveRequest): MoveHead => ({
  kind,
  itemGuid,
  entry,
});

export class ItemsStore {
  private readonly events = new Emitter<[ItemsEvent]>();
  private readonly deps: SessionDeps;
  private readonly core: CoreStores;
  private pending: MoveRequest | undefined;
  private last: MoveOutcome | undefined;
  private seen: InventoryClaim[] = [];

  constructor(deps: SessionDeps, core: CoreStores) {
    this.deps = deps;
    this.core = core;
  }

  snapshot(): ItemsState {
    return { move: { pending: this.pending, last: this.last } };
  }

  onEvent(cb: (event: ItemsEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  inventory(): InventoryState {
    return readInventory(this.deps.selfGuid(), this.deps.getEntity);
  }

  life(): PlayerLife {
    return readLife(this.deps.selfGuid(), this.deps.getEntity).life;
  }

  begin(request: MoveRequest): void {
    this.pending = request;
    this.last = undefined;
    this.seen = [];
    this.noteClaims();
    this.events.emit({ type: "move_requested", ...head(request) });
  }

  noteClaims(): void {
    if (!this.pending) return;
    for (const claim of legacyClaims(this.core))
      if (claim) this.seen.push(claim);
  }

  receiveInventoryFailure(packet: InventoryChangeFailure): void {
    const request = this.pending;
    if (!request || packet.kind !== "error") return;
    const others = [...legacyClaims(this.core), ...this.seen];
    const mine = { itemGuid: request.itemGuid };
    if (!ownsInventoryFailure(packet, mine, others)) return;
    const reason = inventoryResultName(packet.result);
    if (isNoChange(packet))
      this.settle("no_change", reason, {
        type: "move_no_change",
        ...head(request),
      });
    else
      this.settle("refused", reason, {
        type: "move_refused",
        reason,
        result: packet.result,
        ...head(request),
      });
  }

  observeInventory(): void {
    const request = this.pending;
    if (!(request && moveSettled(request, this.inventory()))) return;
    this.settle("confirmed", undefined, { type: "moved", ...head(request) });
  }

  expire(): void {
    const request = this.pending;
    if (!request) return;
    this.settle("unanswered", "server_unanswered", {
      type: "move_unanswered",
      ...head(request),
    });
  }

  abandon(): void {
    this.pending = undefined;
    this.seen = [];
  }

  receiveItem(item: ItemReceived): void {
    this.events.emit({ type: "item_received", ...item });
  }

  dispose(): void {
    this.abandon();
    this.events.clear();
  }

  private settle(
    status: MoveOutcome["status"],
    reason: string | undefined,
    event: ItemsEvent,
  ): void {
    const request = this.pending;
    if (!request) return;
    this.last = { status, reason, request, observedAt: this.deps.now() };
    this.abandon();
    this.events.emit(event);
  }
}
